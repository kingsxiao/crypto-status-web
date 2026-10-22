/**
 * 单色火花线（7 日走势）— web Sparkline 的 RN SVG 移植：
 * 描线 + 向下渐隐的面积填充 + 端点光晕圆点。
 * 颜色由调用方传入（涨跌功能色 up/down，与 web 行容器 currentColor 语义一致）。
 */

import { memo, useMemo } from "react"
import { View } from "react-native"
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg"

interface SparklineProps {
  data: number[]
  width?: number
  height?: number
  strokeWidth?: number
  /** 描线/填充色（涨跌功能色） */
  color: string
  /** 面积填充底色（渐变终点），默认与 color 同色透明渐隐 */
  showDot?: boolean
}

export const Sparkline = memo(function Sparkline({
  data,
  width = 64,
  height = 28,
  strokeWidth = 1.5,
  color,
  showDot = false,
}: SparklineProps) {
  const gid = useMemo(() => `spark-${Math.random().toString(36).slice(2, 8)}`, [])

  const geo = useMemo(() => {
    if (data.length < 2) return null
    const min = Math.min(...data)
    const max = Math.max(...data)
    const span = max - min || 1
    const pad = strokeWidth
    const pts = data.map((v, i) => {
      const x = (i / (data.length - 1)) * width
      const y = pad + (1 - (v - min) / span) * (height - pad * 2)
      return [x, y] as const
    })
    const line = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ")
    const area = `${line} L${width},${height} L0,${height} Z`
    const [lastX, lastY] = pts[pts.length - 1]
    return { line, area, lastX, lastY }
  }, [data, width, height, strokeWidth])

  if (!geo) return <View style={{ width, height, borderRadius: 3, backgroundColor: "transparent" }} />

  return (
    <View>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} accessibilityLabel="7d">
        <Defs>
          <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.22" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={geo.area} fill={`url(#${gid})`} />
        <Path
          d={geo.line}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showDot && (
          <Circle cx={geo.lastX} cy={geo.lastY} r={strokeWidth * 2.6} fill={color} opacity={0.18} />
        )}
        {showDot && <Circle cx={geo.lastX} cy={geo.lastY} r={strokeWidth} fill={color} />}
      </Svg>
    </View>
  )
})
