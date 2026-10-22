/**
 * 双音短促提示（预警与事件提醒共用）；AudioContext 在无用户手势时可能被
 * 拒绝，静默降级。独立成 lib 文件：组件文件只导出组件（react-refresh 约束）。
 */
export function alertBeep() {
  try {
    const ctx = new AudioContext()
    const play = (freq: number, at: number, dur: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "sine"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at)
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + at)
      osc.stop(ctx.currentTime + at + dur + 0.02)
    }
    play(880, 0, 0.16)
    play(1174.7, 0.2, 0.22)
    setTimeout(() => ctx.close().catch(() => {}), 800)
  } catch {
    /* 自动播放策略拦截等场景直接放弃 */
  }
}
