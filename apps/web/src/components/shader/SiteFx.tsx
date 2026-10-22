/**
 * 站点级 shader 效果的接入层 —— 全站仅此处使用 shaders(经 LazyShader 封装)。
 *
 * 两个落点(宁少而精):
 *   - HeroShaderBackdrop:顶部背景由静态 grid-backdrop 升级为 MeshGradient 动态渐变,
 *     fallback 就是原 grid-backdrop(降级/加载期/暂停时视觉与现状完全一致);
 *     mask 与原网格同款 radial 渐隐,shader 层不产生硬边
 *   - CursorTrailFx:全局鼠标拖尾,细线快速消散 + pointer-events-none,低干扰微交互;
 *     fallback 为 null(现状无拖尾,降级即零成本)
 * 主题联动:mono/blue/violet 三套主题各持一组色对,切换经 uniform 更新生效(不重挂);
 * 拖尾为亮色系,暗背景(全站 background 均 ≤ oklch 0.21)下可辨。
 */
import { useTheme, type ThemeId } from "@repo/react/theme"

import { LazyShader } from "@/components/shader/LazyShader"

/** 顶部渐变的三主题配色:colorA 深底色 → colorB 主题亮色,同系低饱和 */
const MESH_BY_THEME: Record<ThemeId, { colorA: string; colorB: string; seed: number }> = {
  mono: { colorA: "#15181e", colorB: "#2c3442", seed: 11 },
  blue: { colorA: "#0a1830", colorB: "#1f4f9e", seed: 23 },
  violet: { colorA: "#170e2e", colorB: "#5b34a8", seed: 37 },
}

/** 拖尾的三主题配色:亮色双阶,保证暗背景可辨 */
const TRAIL_BY_THEME: Record<ThemeId, { colorA: string; colorB: string }> = {
  mono: { colorA: "#9aa7bb", colorB: "#dfe6f0" },
  blue: { colorA: "#3b82f6", colorB: "#93c5fd" },
  violet: { colorA: "#8b5cf6", colorB: "#c4b5fd" },
}

/** 与 grid-backdrop 同款 radial 渐隐(tailwind 任意值,空格以 _ 转义) */
const FADE_MASK = "[mask-image:radial-gradient(ellipse_90%_60%_at_50%_0%,black_30%,transparent_75%)]"

/**
 * 顶部背景:shader 可用时 MeshGradient 柔变渐变覆盖在网格之上(图层 opacity 0.45),
 * 其余一切情况(无 WebGPU/减弱动效/加载中/失败/不可见)呈现原 grid-backdrop。
 */
export function HeroShaderBackdrop() {
  const { theme } = useTheme()
  const c = MESH_BY_THEME[theme]
  return (
    <LazyShader
      containerClassName="inset-x-0 top-0 h-[420px]"
      shaderClassName={FADE_MASK}
      fallback={<div className="grid-backdrop absolute inset-0" />}
    >
      {(mod) => (
        <mod.MeshGradient
          colorA={c.colorA}
          colorB={c.colorB}
          seed={c.seed}
          smoothness={2.6}
          variation={0.3}
          swirl={0.25}
          drift={0.35}
          opacity={0.45}
        />
      )}
    </LazyShader>
  )
}

/**
 * 全局鼠标拖尾:细线(radius 10)柔和快速消散,层透明度 0.55,
 * pointer-events-none + aria-hidden(LazyShader 容器内置),不参与阅读与交互。
 */
export function CursorTrailFx() {
  const { theme } = useTheme()
  const c = TRAIL_BY_THEME[theme]
  return (
    <LazyShader containerClassName="fixed inset-0" fallback={null}>
      {(mod) => <mod.CursorTrail colorA={c.colorA} colorB={c.colorB} radius={10} softness={0.7} opacity={0.55} />}
    </LazyShader>
  )
}
