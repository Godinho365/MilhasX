"use client";
// Peças dos formulários de lançamento: seção recolhível, interruptor, custos, pontos com atalhos e conta.
import { useState } from "react";
import { ChevronDown, Plus, Eraser } from "lucide-react";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { COST_LABELS, type CostType } from "@/domain/costs";
import { planCost, type PaymentPlan } from "@/domain/installments";

export type AccountOpt = { id: string; holder: string; program: string; color: string; balance: number; costCents: number; programId?: string; holderId?: string; logo?: string | null; pinned?: boolean };
export type CardOpt = { id: string; name: string };

export const parsePts = (v: string) => Number(v.replace(/\D/g, "")) || 0;
export const accountLabel = (a: AccountOpt) => `${a.program} ${a.holder}`;

export function Collapsible({ icon, title, subtitle, open, onToggle, children, right }: { icon: React.ReactNode; title: string; subtitle: string; open: boolean; onToggle: () => void; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel2 text-zinc-300">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{title}</span>
          <span className="block truncate text-xs text-muted">{subtitle}</span>
        </span>
        {right}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line px-4 pb-4 pt-3">{children}</div>}
    </section>
  );
}

export function Switch({ checked, onChange, label, hint, id }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string; id?: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4" htmlFor={id}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? "bg-accent-light" : "bg-zinc-700"}`}
      >
        <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[#fff] shadow transition-transform ${checked ? "translate-x-5" : ""}`} />
      </button>
    </label>
  );
}

export function PointsInput({ value, onChange, label = "Pontos", quick = [[100, "+100"], [1000, "+1k"], [10000, "+10k"]] as [number, string][], placeholder = "0" }: { value: string; onChange: (v: string) => void; label?: string; quick?: [number, string][]; placeholder?: string }) {
  const add = (n: number) => onChange(fmtPts(parsePts(value) + n));
  return (
    <div>
      <input className="input tabular-nums" inputMode="numeric" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value ? fmtPts(parsePts(e.target.value)) : "")} aria-label={label} />
      {/* Atalhos abaixo do campo: dentro dele espremiam o número em colunas estreitas */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {quick.map(([n, l]) => (
          <button key={l} type="button" onClick={() => add(n)} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-medium text-muted transition-colors hover:border-zinc-500 hover:text-white">{l}</button>
        ))}
      </div>
    </div>
  );
}

export function AccountSelect({ accounts, value, onChange, placeholder = "Selecione", label }: { accounts: AccountOpt[]; value: string; onChange: (v: string) => void; placeholder?: string; label?: string }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
      <option value="" disabled>{placeholder}</option>
      {accounts.map((a) => <option key={a.id} value={a.id}>{accountLabel(a)}</option>)}
    </select>
  );
}

export type CostRow = { type: CostType | ""; amount: string; cardId: string };
export const emptyCost = (type: CostType | "" = ""): CostRow => ({ type, amount: "", cardId: "" });

/** Custos: Tipo | Valor | Cartão, com "Adicionar custo" e total (como na referência). */
export function CostRows({ rows, setRows, types, cards }: { rows: CostRow[]; setRows: (r: CostRow[]) => void; types: CostType[]; cards: CardOpt[] }) {
  const total = rows.reduce((t, r) => t + (parseBRLToCents(r.amount) ?? 0), 0);
  const set = (i: number, patch: Partial<CostRow>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="space-y-2">
      <div className="hidden grid-cols-[1.6fr_1fr_1.4fr_auto] gap-2 text-xs font-medium text-muted sm:grid">
        <span>Tipo</span><span>Valor</span><span>Cartão</span><span className="w-9" />
      </div>
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[1.6fr_1fr_1.4fr_auto]">
          <select className="input col-span-2 sm:col-span-1" value={r.type} onChange={(e) => set(i, { type: e.target.value as CostType })} aria-label={`Tipo do custo ${i + 1}`}>
            <option value="" disabled>Selecione o tipo</option>
            {types.map((t) => <option key={t} value={t}>{COST_LABELS[t]}</option>)}
          </select>
          <input className="input tabular-nums" inputMode="decimal" placeholder="R$ 0,00" value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} aria-label={`Valor do custo ${i + 1}`} />
          <select className="input" value={r.cardId} onChange={(e) => set(i, { cardId: e.target.value })} aria-label={`Cartão do custo ${i + 1}`}>
            <option value="">Nenhum</option>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button type="button" className="btn-subtle hidden h-10 w-9 px-0 sm:inline-flex" onClick={() => setRows(rows.length > 1 ? rows.filter((_, j) => j !== i) : [emptyCost(types[0])])} aria-label={`Limpar custo ${i + 1}`}><Eraser className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex items-center justify-between pt-1">
        <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-light hover:underline" onClick={() => setRows([...rows, emptyCost()])}><Plus className="h-4 w-4" />Adicionar custo</button>
        <span className="text-sm font-semibold tabular-nums">Total: {fmtBRL(total)}</span>
      </div>
    </div>
  );
}

/** Converte as linhas de custo preenchidas para a API. Retorna erro se algum valor for inválido. */
export function costsPayload(rows: CostRow[]): { items: { type: CostType; amountCents: number; cardId: string | null }[]; erro?: string } {
  const items = [];
  for (const [i, r] of rows.entries()) {
    if (!r.amount.trim()) continue;
    const v = parseBRLToCents(r.amount);
    if (v === null) return { items: [], erro: `Custo ${i + 1}: valor inválido` };
    if (!r.type) return { items: [], erro: `Custo ${i + 1}: escolha o tipo` };
    items.push({ type: r.type, amountCents: v, cardId: r.cardId || null });
  }
  return { items };
}

export function useDirty<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [dirty, setDirty] = useState(false);
  return { value, set: (v: T) => { setValue(v); setDirty(true); }, dirty, reset: () => { setValue(initial); setDirty(false); } };
}

/* ---------- Pagamento: à vista ou parcelado, com antecipação das parcelas restantes ---------- */

export type PayState = { installments: number; anticipate: boolean; payoff: string };
export const emptyPay = (): PayState => ({ installments: 1, anticipate: false, payoff: "" });
export const toPlan = (p: PayState): PaymentPlan => ({ installments: p.installments, anticipate: p.anticipate, payoffCents: p.payoff.trim() ? parseBRLToCents(p.payoff) : null });
/** Detalhe gravado no lançamento (só quando parcelado). */
export const paymentDetail = (p: PayState, totalCents: number) => {
  if (p.installments <= 1) return null;
  const r = planCost(totalCents, toPlan(p));
  return { installments: p.installments, anticipated: r.discountCents > 0, nominalCents: totalCents, paidCents: r.effectiveCents, discountCents: r.discountCents };
};
const pctBR = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function PaymentFields({ totalCents, value, onChange, label = "Pagamento" }: { totalCents: number; value: PayState; onChange: (p: PayState) => void; label?: string }) {
  const r = planCost(totalCents, toPlan(value));
  const n = value.installments;
  const payoffInvalid = value.anticipate && value.payoff.trim() !== "" && (toPlan(value).payoffCents == null || (toPlan(value).payoffCents ?? 0) > r.restCents);
  return (
    <div className="space-y-3 rounded-xl border border-line p-3" aria-label={label}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium">{label}</span>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Forma de pagamento">
          {([[false, "À vista"], [true, "Parcelado"]] as const).map(([parc, l]) => (
            <button key={l} type="button" role="tab" aria-selected={(n > 1) === parc} onClick={() => onChange(parc ? { ...value, installments: n > 1 ? n : 12 } : emptyPay())} className={`rounded-lg px-3 py-1 text-sm font-medium ${(n > 1) === parc ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        {n > 1 && (
          <select className="input h-9 w-auto py-1" value={n} onChange={(e) => onChange({ ...value, installments: Number(e.target.value) })} aria-label="Número de parcelas">
            {Array.from({ length: 11 }, (_, i) => i + 2).map((k) => <option key={k} value={k}>{k}x</option>)}
          </select>
        )}
      </div>
      {n > 1 && (
        <>
          <p className="text-xs text-muted">{totalCents > 0 ? <>1ª parcela {fmtBRL(r.firstCents)} + {n - 1}× {fmtBRL(r.installmentCents)}. Parcelado sem antecipar, o custo continua {fmtBRL(totalCents)}.</> : "Informe o valor para ver as parcelas."}</p>
          <Switch checked={value.anticipate} onChange={(v) => onChange({ ...value, anticipate: v })} label={`Antecipar as ${n - 1} parcelas restantes`} hint="A 1ª parcela é paga normal; as outras são quitadas com desconto" />
          {value.anticipate && (
            <div className="space-y-2">
              <label className="block text-sm">
                <span className="label">Valor para quitar as {n - 1} parcelas (R$)</span>
                <input className="input tabular-nums" inputMode="decimal" placeholder={totalCents > 0 ? `até ${fmtBRL(r.restCents)}` : "R$ 0,00"} value={value.payoff} onChange={(e) => onChange({ ...value, payoff: e.target.value })} aria-label="Valor para quitar as parcelas" />
              </label>
              {payoffInvalid && <p className="text-xs text-red-300">O valor para quitar não pode passar de {fmtBRL(r.restCents)} (as {n - 1} parcelas).</p>}
              {r.discountCents > 0 && (
                <p className="rounded-lg bg-panel2 px-3 py-2 text-xs text-muted" aria-label="Resumo da antecipação">
                  Desconto de <b className="text-ok">{fmtBRL(r.discountCents)}</b>: {pctBR(r.discountPct ?? 0)} nas parcelas antecipadas · {pctBR(r.discountTotalPct ?? 0)} na compra · ≈ {pctBR(r.monthlyRatePct ?? 0)} ao mês. Custo real: <b className="text-white">{fmtBRL(r.effectiveCents)}</b>.
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
