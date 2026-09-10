/** 持仓新增/编辑表单：币种下拉 + 数量/成本输入 + 实时估值 */

import { useEffect, useRef, useState } from "react"
import { ChevronDown, Pencil, Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHead, CardHeader } from "@/components/ui/card"
import { IconChip } from "@/components/ui/icon-chip"
import { Input } from "@/components/ui/input"
import { t, useT } from "@/i18n"
import type { Coin } from "@/lib/api"
import { formatPrice, parseNum } from "@/lib/format"
import type { PriceRef } from "@/lib/portfolio"

export type FormState =
  | { mode: "closed" }
  | { mode: "add"; coinId: string; amount: string; cost: string }
  | { mode: "edit"; id: string; coinId: string; amount: string; cost: string }

export function HoldingForm({
  coins,
  state,
  prices,
  existing,
  onChange,
  onClose,
  onSubmit,
}: {
  coins: Coin[]
  state: Extract<FormState, { mode: "add" | "edit" }>
  prices: Record<string, PriceRef>
  /** 编辑的币种是否已在持仓中（add 模式下用于覆盖提示） */
  existing: boolean
  onChange: (s: FormState) => void
  onClose: () => void
  onSubmit: () => void
}) {
  useT()
  const [error, setError] = useState<string | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" })
  }, [])

  const amountNum = parseNum(state.amount)
  const price = prices[state.coinId]?.price ?? coins.find((c) => c.id === state.coinId)?.current_price ?? null
  const estimate = price != null && Number.isFinite(amountNum) && amountNum > 0 ? amountNum * price : null

  const submit = () => {
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      setError(t("pf.form.amountInvalid"))
      return
    }
    const costNum = state.cost.trim() === "" ? null : parseNum(state.cost)
    if (costNum != null && (!Number.isFinite(costNum) || costNum < 0)) {
      setError(t("pf.form.costInvalid"))
      return
    }
    setError(null)
    onSubmit()
  }

  return (
    <div ref={cardRef}>
    <Card className="fade-up">
      <CardHeader>
        <CardHead
          title={
            <span className="flex items-center gap-2.5">
              <IconChip className="border-primary/30 bg-primary/10 text-primary">
                {state.mode === "add" ? <Plus /> : <Pencil />}
              </IconChip>
              {state.mode === "add" ? t("pf.form.add") : t("pf.form.edit")}
            </span>
          }
          desc={existing && state.mode === "add" ? t("pf.form.exists") : t("pf.form.desc")}
        />
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label htmlFor="pf-coin" className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("pf.form.asset")}
            </label>
            <div className="relative">
              <select
                id="pf-coin"
                value={state.coinId}
                disabled={state.mode === "edit"}
                onChange={(e) => onChange({ ...state, coinId: e.target.value })}
                className="h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-8 font-mono text-sm font-semibold uppercase outline-none transition-colors focus-visible:border-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:opacity-60"
              >
                {coins.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.symbol.toUpperCase()} · {c.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
            </div>
          </div>
          <div>
            <label htmlFor="pf-amount" className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("pf.form.amount")}
            </label>
            <Input
              id="pf-amount"
              inputMode="decimal"
              value={state.amount}
              onChange={(e) => onChange({ ...state, amount: e.target.value })}
              placeholder="0.00"
              className="h-11 font-mono text-lg font-semibold tabular"
            />
          </div>
          <div>
            <label htmlFor="pf-cost" className="mb-1 block font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
              {t("pf.form.cost")}
            </label>
            <Input
              id="pf-cost"
              inputMode="decimal"
              value={state.cost}
              onChange={(e) => onChange({ ...state, cost: e.target.value })}
              placeholder="USD · 选填"
              className="h-11 font-mono text-lg font-semibold tabular"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] text-muted-foreground">
            <span>
              {t("pf.form.valueNow")}：{" "}
              <span className="font-semibold text-foreground tabular">
                {estimate != null ? `$${formatPrice(estimate)}` : "—"}
              </span>
            </span>
            {error && <span className="text-down">{error}</span>}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button size="sm" onClick={submit}>
              {t("common.save")}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
    </div>
  )
}
