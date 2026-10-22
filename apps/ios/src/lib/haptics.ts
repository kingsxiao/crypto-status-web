/**
 * 触感反馈（iOS 平台适配层，归属 app）：
 * 页面工程师统一走本封装，不直接 import expo-haptics ——
 *   - selection：分段切换/主题与语言选择（HIG selection）
 *   - light/medium：主操作确认（保存持仓、新增预警）
 *   - success/warning/error：预警触发结果（与本地通知配套）
 * 系统设置关闭触感时 expo-haptics 自行 no-op，无需调用方判断。
 */

import * as Haptics from "expo-haptics"

export function hapticSelection(): void {
  void Haptics.selectionAsync().catch(() => {})
}

export function hapticImpact(mode: "light" | "medium" = "light"): void {
  const style =
    mode === "light" ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium
  void Haptics.impactAsync(style).catch(() => {})
}

export function hapticNotify(kind: "success" | "warning" | "error"): void {
  const style =
    kind === "success"
      ? Haptics.NotificationFeedbackType.Success
      : kind === "warning"
        ? Haptics.NotificationFeedbackType.Warning
        : Haptics.NotificationFeedbackType.Error
  void Haptics.notificationAsync(style).catch(() => {})
}
