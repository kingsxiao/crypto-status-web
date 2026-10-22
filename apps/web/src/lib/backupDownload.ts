/**
 * 浏览器端备份下载（DOM 专属：Blob/URL/a.click 留守 web；
 * 打包/校验/导入三函数在 @repo/core/backup）。
 */

import { BACKUP_FILENAME_PREFIX, buildBackup } from "@repo/core/backup"

/** 浏览器内生成备份 JSON 并触发下载（复刻事件页 ICS 导出的 a.download 先例） */
export function downloadBackup(): void {
  const blob = new Blob([JSON.stringify(buildBackup(), null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = `${BACKUP_FILENAME_PREFIX}-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  // 立即 revoke 在个别浏览器会截断尚未开始的下载，让出一拍再回收
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
