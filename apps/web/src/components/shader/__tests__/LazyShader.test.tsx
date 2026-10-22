// @vitest-environment jsdom
/**
 * LazyShader 降级与暂停路径的行为锁定(jsdom 无 navigator.gpu,天然覆盖降级分支):
 *  - 无 WebGPU / prefers-reduced-motion(含同步初值不拉 chunk) / 适配器预检失败 /
 *    GPU 运行期失败 → 只渲染 fallback,不白屏
 *  - IntersectionObserver 视口外、visibilitychange 切标签页、运行中开启减弱动效
 *    → 卸载 shader 层暂停渲染,恢复后重挂
 *  - GPU 失败后实例闩锁:重新可见也不再挂载
 *  - 卸载时 IO disconnect、visibilitychange/matchMedia 监听全部拆除
 * shaders/react 经 vi.mock 替换为可控桩(不加载真模块),Shader 桩按 hoisted 状态触发 onReady/onUnavailable。
 */
import { act, cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { LazyShader, type ShaderModule } from "@/components/shader/LazyShader"
import { __resetAdapterProbe } from "@/components/shader/adapterProbe"

/** Shader 桩的行为开关与挂载/加载计数(vi.mock 工厂在 hoist 阶段执行,只能经 vi.hoisted 取状态) */
const hoisted = vi.hoisted(() => ({
  mode: "ready" as "ready" | "unavailable",
  mounts: 0,
  unmounts: 0,
  factoryLoads: 0,
}))

vi.mock("shaders/react", async () => {
  const React = await import("react")
  hoisted.factoryLoads++ // 每次真实走到的动态 import 都会执行工厂(resetModules 后重新计数)
  const ShaderStub = (props: {
    className?: string
    children?: React.ReactNode
    onReady?: () => void
    onUnavailable?: (reason: string) => void
  }) => {
    const { onReady, onUnavailable } = props
    React.useEffect(() => {
      hoisted.mounts++
      if (hoisted.mode === "ready") onReady?.()
      else onUnavailable?.("no-adapter")
      return () => {
        hoisted.unmounts++
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 桩只在意挂载时机,回调引用每次渲染都变
    }, [])
    // className 拼接行为对齐真实库:"shader" + 调用方类名
    return React.createElement(
      "div",
      {
        className: "shader shader-stub" + (props.className ? " " + props.className : ""),
        "data-testid": "shader-stub",
      },
      props.children,
    )
  }
  const mod = {
    Shader: ShaderStub,
    Aurora: (props: Record<string, unknown>) => React.createElement("div", { ...props, "data-testid": "aurora-child" }),
    isWebGPUSupported: () => true,
  }
  // mock 只需覆盖 LazyShader 与用例用到的成员,断言为完整模块类型
  return mod as unknown as ShaderModule
})

/** jsdom 没有 navigator.gpu:按用例注入/移除,adapter 控制预检结论(null = 无适配器) */
function stubWebGPU(present: boolean, adapter: unknown = {}) {
  Object.defineProperty(navigator, "gpu", {
    value: present ? { requestAdapter: () => Promise.resolve(adapter) } : undefined,
    configurable: true,
  })
}

/** matchMedia 桩:受控 matches + 记录 change 监听,便于断言解绑 */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const mql = {
    matches,
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addEventListener: (_t: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_t: string, cb: () => void) => listeners.delete(cb),
    addListener: (cb: () => void) => listeners.add(cb),
    removeListener: (cb: () => void) => listeners.delete(cb),
    dispatchEvent: () => true,
  }
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql))
  return { listeners, setMatches: (m: boolean) => (mql.matches = m) }
}

type IOInstance = { callback: IntersectionObserverCallback; disconnected: boolean }

/** IntersectionObserver 桩:记录实例以便手动触发 callback 与断言 disconnect */
function stubIntersectionObserver() {
  const instances: IOInstance[] = []
  class IOStub {
    callback: IntersectionObserverCallback
    disconnected = false
    root = null
    rootMargin = ""
    thresholds = [0]
    constructor(cb: IntersectionObserverCallback) {
      this.callback = cb
      const rec = this as unknown as IOInstance
      instances.push(rec)
    }
    observe() {}
    unobserve() {}
    takeRecords() {
      return []
    }
    disconnect() {
      this.disconnected = true
    }
  }
  vi.stubGlobal("IntersectionObserver", IOStub)
  return instances
}

/** 当前用例的桩句柄(beforeEach 重建) */
let ioInstances: IOInstance[] = []
let mqlState: ReturnType<typeof stubMatchMedia>

/** 触发一次 IO callback,模拟滚入/滚出视口 */
function fireIntersect(isIntersecting: boolean) {
  const target = ioInstances[ioInstances.length - 1]
  act(() => {
    target.callback([{ isIntersecting } as IntersectionObserverEntry], target as unknown as IntersectionObserver)
  })
}

/** 等动态 import 的 then 链与后续 effect 走完 */
async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

function renderLazy() {
  return render(
    <LazyShader fallback={<div data-testid="fallback">css-gradient</div>}>
      {(m) => <m.Aurora />}
    </LazyShader>,
  )
}

beforeEach(() => {
  hoisted.mode = "ready"
  hoisted.mounts = 0
  hoisted.unmounts = 0
  __resetAdapterProbe()
  stubWebGPU(false)
  mqlState = stubMatchMedia(false)
  ioInstances = stubIntersectionObserver()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete (navigator as { gpu?: unknown }).gpu
  Object.defineProperty(document, "hidden", { value: false, configurable: true })
  vi.clearAllMocks()
})

describe("LazyShader 降级路径", () => {
  it("无 WebGPU(jsdom) → 只渲染 fallback,不发起懒加载", async () => {
    const { container } = renderLazy()
    await flush()

    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    expect(hoisted.mounts).toBe(0)
  })

  it("prefers-reduced-motion: reduce → 直接降级,即便有 WebGPU", async () => {
    stubWebGPU(true)
    mqlState.setMatches(true)
    const { container } = renderLazy()
    await flush()

    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    expect(hoisted.mounts).toBe(0)
  })

  it("有 WebGPU 且可加载 → shader 层经 onReady 淡入,fallback 仍在底层,children 收到真实模块", async () => {
    stubWebGPU(true)
    const { container } = renderLazy()
    await flush()

    const shaderEl = container.querySelector('[data-testid="shader-stub"]')
    expect(shaderEl).not.toBeNull()
    expect(shaderEl!.className).toContain("opacity-100") // onReady 后淡入
    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="aurora-child"]')).not.toBeNull() // children(mod) 已求值
  })

  it("GPU 运行期失败(onUnavailable) → 闩锁降级:shader 层卸载,重新可见也不再挂载", async () => {
    stubWebGPU(true)
    hoisted.mode = "unavailable"
    const { container } = renderLazy()
    await flush()

    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    expect(hoisted.unmounts).toBeGreaterThan(0)
    const mountsAfterFailure = hoisted.mounts

    fireIntersect(false)
    fireIntersect(true)
    await flush()

    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    expect(hoisted.mounts).toBe(mountsAfterFailure) // 实例闩锁:无重试
  })

  it("prefers-reduced-motion: reduce(同步初值) → 连模块都不加载(工厂计数不变),不拉 chunk", async () => {
    // 冒烟回归:异步检测滞后曾让减弱动效用户也发起一次 chunk 请求
    vi.resetModules() // 清模块缓存,fresh 实例 + factoryLoads 可观测
    const { LazyShader: FreshLazyShader } = await import("@/components/shader/LazyShader")
    const loadsBefore = hoisted.factoryLoads
    stubWebGPU(true)
    mqlState.setMatches(true)

    const { container } = render(
      <FreshLazyShader fallback={<div data-testid="fallback">css-gradient</div>}>
        {() => null}
      </FreshLazyShader>,
    )
    await flush()

    expect(hoisted.factoryLoads).toBe(loadsBefore) // 动态 import 未发起
    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
  })

  it("navigator.gpu 存在但 requestAdapter 返回 null(无适配器无头场景) → 预检闩锁:不加载模块不挂载", async () => {
    // 冒烟回归:无 GPU 适配器的无头环境曾拉满 chunk 后才经 onUnavailable 降级
    vi.resetModules()
    const { LazyShader: FreshLazyShader } = await import("@/components/shader/LazyShader")
    const loadsBefore = hoisted.factoryLoads
    stubWebGPU(true, null)

    const { container } = render(
      <FreshLazyShader fallback={<div data-testid="fallback">css-gradient</div>}>
        {() => null}
      </FreshLazyShader>,
    )
    await flush()

    expect(hoisted.factoryLoads).toBe(loadsBefore) // 预检失败,不 import
    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
  })

  it("动态 import 失败(chunk 弱网拉取失败) → 安静降级,fallback 不白屏", async () => {
    stubWebGPU(true)
    // resetModules 丢弃 LazyShader 的模块级单例缓存与已加载的 mock,
    // 让本次用例拿到"未加载过"的新实例,再以抛错工厂令 import() reject
    vi.resetModules()
    vi.doMock("shaders/react", () => {
      throw new Error("chunk load failed")
    })
    const { LazyShader: FreshLazyShader } = await import("@/components/shader/LazyShader")
    const { container } = render(
      <FreshLazyShader fallback={<div data-testid="fallback">css-gradient</div>}>
        {() => null}
      </FreshLazyShader>,
    )
    await flush()

    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    vi.doUnmock("shaders/react")
  })
})

describe("LazyShader 暂停与清理", () => {
  it("滚出视口(IO isIntersecting=false) → 卸载 shader 层暂停,fallback 不受影响", async () => {
    stubWebGPU(true)
    const { container } = renderLazy()
    await flush()
    expect(container.querySelector('[data-testid="shader-stub"]')).not.toBeNull()

    fireIntersect(false)

    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
  })

  it("滚回视口 → shader 层重挂并再次淡入", async () => {
    stubWebGPU(true)
    const { container } = renderLazy()
    await flush()

    fireIntersect(false)
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()

    fireIntersect(true)
    await flush()

    const shaderEl = container.querySelector('[data-testid="shader-stub"]')
    expect(shaderEl).not.toBeNull()
    expect(shaderEl!.className).toContain("opacity-100")
  })

  it("document.hidden(切标签页) → 卸载暂停;切回 → 重挂", async () => {
    stubWebGPU(true)
    const { container } = renderLazy()
    await flush()
    expect(container.querySelector('[data-testid="shader-stub"]')).not.toBeNull()

    act(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()

    act(() => {
      Object.defineProperty(document, "hidden", { value: false, configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
    await flush()
    expect(container.querySelector('[data-testid="shader-stub"]')).not.toBeNull()
  })

  it("运行中开启 prefers-reduced-motion → 卸载 shader 层即时降级", async () => {
    stubWebGPU(true)
    const { container } = renderLazy()
    await flush()
    expect(container.querySelector('[data-testid="shader-stub"]')).not.toBeNull()

    act(() => {
      mqlState.setMatches(true)
      mqlState.listeners.forEach((cb) => cb())
    })

    expect(container.querySelector('[data-testid="shader-stub"]')).toBeNull()
    expect(container.querySelector('[data-testid="fallback"]')).not.toBeNull()
  })

  it("卸载组件 → IO disconnect、visibilitychange 与 matchMedia 监听全部拆除", async () => {
    stubWebGPU(true)
    const { unmount } = renderLazy()
    await flush()

    expect(ioInstances.length).toBeGreaterThan(0)
    const io = ioInstances[ioInstances.length - 1]

    unmount()

    expect(io.disconnected).toBe(true)
    expect(mqlState.listeners.size).toBe(0)
    // document 上的 visibilitychange 监听已移除:再派发不应抛错
    act(() => {
      Object.defineProperty(document, "hidden", { value: true, configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
    })
  })
})
