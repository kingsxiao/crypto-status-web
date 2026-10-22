/**
 * shaders(WebGPU 渲染)的共享懒加载封装 —— 全站接入动态 shader 背景的唯一入口。
 *
 * 设计约定:
 *   - 绝不白屏:降级视觉(fallback)常驻底层,shader 层以绝对定位覆盖其上;
 *     加载中 / 加载失败 / GPU 不可用 / 系统减弱动效 / 不可见暂停时,fallback 就是全部视觉
 *   - 懒加载四重门控,全部通过才发起 import("shaders/react"):
 *     ① navigator.gpu 存在(同步检测) ② 非 prefers-reduced-motion(同步惰性初值,
 *     首渲染即正确 —— 减弱动效用户不发起任何 chunk 请求) ③ 视口内且标签页可见
 *     ④ 适配器预检:页面级缓存的 requestAdapter 探测,无适配器的无头/虚拟机环境
 *     在此闩锁降级,不拉 shader chunk 也不挂渲染器(浏览器原生 "No available adapters"
 *     告警由每实例一次收敛为整页一次)
 *   - 模块级单例缓存让多实例共享一次加载,首屏 bundle 不含 shaders;
 *     适配器/设备级失败仍由库经 onUnavailable 回调兜底 → 实例闩锁降级,不再重试
 *   - 暂停 = 卸载:IntersectionObserver(视口外)与 visibilitychange(切标签页)任一
 *     不可见即整体卸载 Shader 子树,暂停渲染并释放 GPU;重新可见时利用已缓存的模块
 *     重挂(代价是 renderer 重新初始化,对低频背景装饰可接受)
 *   - DPR 由库内部钳制(min(devicePixelRatio, 2),移动端 1.5),React 层无覆盖入口,
 *     封装不再重复处理
 *   - 卸载清理:IO / visibilitychange / matchMedia 监听全部拆除,
 *     import 结果经 cancelled 标志丢弃,不让过期回调触碰已卸载组件
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"

import { probeAdapter } from "@/components/shader/adapterProbe"
import { cn } from "@/lib/utils"

/** shaders/react 的模块类型:调用方在 children 回调里拿到真实组件与 props(一切以包的类型声明为准) */
export type ShaderModule = typeof import("shaders/react")

/** 模块级单例:多实例共享同一次动态 import;失败时清空,下次可见时允许重试 */
let shaderModulePromise: Promise<ShaderModule> | null = null

function loadShaderModule(): Promise<ShaderModule> {
  if (!shaderModulePromise) {
    shaderModulePromise = import("shaders/react")
    // chunk 拉取失败(弱网)不应永久污染缓存
    shaderModulePromise.catch(() => {
      shaderModulePromise = null
    })
  }
  return shaderModulePromise
}

/** 同步特性检测:navigator.gpu 缺失(jsdom/SSR/老浏览器)即降级 */
function hasWebGPU(): boolean {
  return typeof navigator !== "undefined" && (navigator as { gpu?: unknown }).gpu != null
}

/** 减弱动效同步初值:首渲染即正确,避免检测异步滞后导致降级用户也发起 chunk 请求 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

interface LazyShaderProps {
  /** shader 内容:仅在激活渲染时调用,mod 是 shaders/react 的完整命名空间 */
  children: (mod: ShaderModule) => ReactNode
  /** 降级视觉:CSS 渐变/静态图等,常驻渲染,建议 absolute inset-0 撑满容器 */
  fallback: ReactNode
  /** 外层定位容器类名(默认占满父级,父级需 relative) */
  containerClassName?: string
  /** shader 覆盖层补充类名(如混合模式、附加透明度) */
  shaderClassName?: string
}

export function LazyShader({ children, fallback, containerClassName, shaderClassName }: LazyShaderProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [mod, setMod] = useState<ShaderModule | null>(null)
  const [gpuOk, setGpuOk] = useState(hasWebGPU)
  // 惰性同步初值:首渲染即正确(冒烟发现的缺陷 —— 异步检测滞后让减弱动效用户也拉了 chunk)
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion)
  // 无 IntersectionObserver 的环境(老浏览器/特殊 jsdom)假定可见,不让检测手段缺失变成降级
  const [inView, setInView] = useState(true)
  const [tabVisible, setTabVisible] = useState(true)
  const [shaderReady, setShaderReady] = useState(false)
  /** 加载失败 / GPU 初始化失败的实例级闩锁:安静降级,本实例生命周期内不再尝试 */
  const [failed, setFailed] = useState(false)

  // —— 环境检测:WebGPU 重新校验(SSR 初始 false 的场景)+ 减弱动效订阅系统设置变化 ——
  useEffect(() => {
    setGpuOk(hasWebGPU())
    if (typeof window.matchMedia !== "function") return
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)")
    const apply = () => setReducedMotion(mql.matches)
    apply()
    mql.addEventListener("change", apply)
    return () => mql.removeEventListener("change", apply)
  }, [])

  // —— 可见性:视口内(IO)且标签页可见(visibilitychange)才允许渲染 ——
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onVisibility = () => setTabVisible(!document.hidden)
    onVisibility()
    document.addEventListener("visibilitychange", onVisibility)
    let io: IntersectionObserver | null = null
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(
        (entries) => {
          const entry = entries[entries.length - 1]
          if (entry) setInView(entry.isIntersecting)
        },
        { threshold: 0 },
      )
      io.observe(el)
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility)
      io?.disconnect()
    }
  }, [])

  const active = gpuOk && !reducedMotion && inView && tabVisible && !failed

  // —— 懒加载四重门控全过后:先适配器预检(页面级缓存),通过才拉模块;任何一步失败安静降级 ——
  useEffect(() => {
    if (!active) return
    let cancelled = false
    probeAdapter().then((adapterOk) => {
      if (cancelled) return
      if (!adapterOk) {
        // 无适配器(无头/虚拟机/驱动黑名单):不拉 chunk 不挂渲染器,直接闩锁降级
        setFailed(true)
        return
      }
      loadShaderModule().then(
        (m) => {
          if (!cancelled) setMod(m)
        },
        () => {
          // 加载失败:fallback 已在渲染,安静降级即可
          if (!cancelled) setFailed(true)
        },
      )
    })
    return () => {
      cancelled = true
    }
  }, [active])

  // 暂停卸载时复位淡入标记,重挂后等新一轮 onReady 再淡入
  useEffect(() => {
    if (!active) setShaderReady(false)
  }, [active])

  // GPU 级失败(无适配器/设备丢失等)由库回调,闩锁降级
  const handleUnavailable = useCallback(() => setFailed(true), [])
  const handleReady = useCallback(() => setShaderReady(true), [])

  return (
    <div ref={containerRef} aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", containerClassName)}>
      {/* 降级视觉常驻底层:任何非激活态它就是全部视觉,不白屏 */}
      {fallback}
      {mod && active && (
        <mod.Shader
          className={cn(
            "absolute inset-0 transition-opacity duration-700",
            shaderReady ? "opacity-100" : "opacity-0",
            shaderClassName,
          )}
          disableTelemetry
          onReady={handleReady}
          onUnavailable={handleUnavailable}
        >
          {children(mod)}
        </mod.Shader>
      )}
    </div>
  )
}
