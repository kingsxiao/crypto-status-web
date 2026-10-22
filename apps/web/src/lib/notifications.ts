/**
 * 浏览器通知权限（web 平台专属；RN 通知走 expo-notifications）。
 */


export function notifySupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window
}

export function notifyPermission(): NotificationPermission | "unsupported" {
  return notifySupported() ? Notification.permission : "unsupported"
}

/** 需在用户手势（点击创建预警）内调用，否则部分浏览器会拒绝 */
export function requestNotifyPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notifySupported()) return Promise.resolve("unsupported")
  return Notification.requestPermission()
}

