/**
 * 本地通知与提示音（iOS 平台适配层，归属 app 不属共享包）：
 * 预警触发 / 事件提醒经 expo-notifications 弹横幅；系统提示音走默认
 * critical 声（expo-notifications 无独立 beep API，与 web 的 WebAudio
 * beep.ts 语义对齐为「触发即响一声」）。
 */

import * as Notifications from "expo-notifications"

let configured = false

async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync()
  if (cur.granted) return true
  const req = await Notifications.requestPermissionsAsync()
  return req.granted
}

/** app 启动时配置前台横幅展示（_layout 已装 expo-notifications 插件） */
export function configureNotifications(): void {
  if (configured) return
  configured = true
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  })
}

/** 触发一条本地通知（预警触发 / 事件到期提醒共用）；无权限静默跳过 */
export async function notifyLocal(title: string, body: string): Promise<void> {
  try {
    if (!(await ensurePermission())) return
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: null,
    })
  } catch {
    /* 通知不可用不阻塞主流程 */
  }
}
