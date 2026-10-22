import { useCallback, useEffect, useState } from "react"

import { readHoldings, writeHoldings, type Holding } from "@repo/core/portfolio"
import { subscribeDomainChange } from "@repo/core/eventPort"

/**
 * 持仓 hook — 域存储与统计纯函数在 @repo/core/portfolio；
 * 同页多组件经双通道端口共享同一份数据。
 */
export function usePortfolio() {
  const [holdings, setHoldings] = useState<Holding[]>(readHoldings)

  useEffect(() => subscribeDomainChange("portfolio", () => setHoldings(readHoldings())), [])

  /** 新增或覆盖一币种持仓（按 id 去重，编辑即覆盖） */
  const upsert = useCallback((h: Holding) => {
    const cur = readHoldings().filter((x) => x.id !== h.id)
    writeHoldings([...cur, h])
  }, [])

  const remove = useCallback((id: string) => {
    writeHoldings(readHoldings().filter((x) => x.id !== id))
  }, [])

  const clear = useCallback(() => writeHoldings([]), [])

  return { holdings, upsert, remove, clear }
}
