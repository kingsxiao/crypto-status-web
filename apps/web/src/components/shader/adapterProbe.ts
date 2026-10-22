/**
 * GPU 适配器预检 —— LazyShader 懒加载的第四重门控。
 *
 * 页面级缓存(整页只探测一次):navigator.gpu 存在但 requestAdapter 返回 null 的
 * 无头/虚拟机/驱动黑名单环境,在拉取 shader chunk(~745KB gz)与挂载渲染器之前
 * 就闩锁降级;浏览器对 requestAdapter 的原生 "No available adapters" 告警也从
 * 每实例一次收敛为整页一次。
 */
/** 模块级缓存:多实例(Hero 背景 + 拖尾)共享同一次探测结论 */
let adapterProbePromise: Promise<boolean> | null = null

export function probeAdapter(): Promise<boolean> {
  if (!adapterProbePromise) {
    adapterProbePromise = (async () => {
      const gpu = (navigator as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu
      if (!gpu || typeof gpu.requestAdapter !== "function") return false
      try {
        return (await gpu.requestAdapter()) != null
      } catch {
        return false
      }
    })()
  }
  return adapterProbePromise
}

/** 测试 seam:清空页面级探测缓存(先例:shaders 库自身导出 __resetWebGPUSupportProbe) */
export function __resetAdapterProbe(): void {
  adapterProbePromise = null
}
