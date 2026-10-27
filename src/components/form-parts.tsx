"use client";
// Peças dos formulários de lançamento: seção recolhível, interruptor, custos, pontos com atalhos e conta.
import { useState } from "react";
import { ChevronDown, Plus, Eraser } from "lucide-react";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { COST_LABELS, type CostType } from "@/domain/costs";

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
    <div className="relative">
      <input className="input pr-[124px] tabular-nums" inputMode="numeric" placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value ? fmtPts(parsePts(e.target.value)) : "")} aria-label={label} />
      <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
        {quick.map(([n, l]) => (
          <button key={l} type="button" onClick={() => add(n)} className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-panel2 hover:text-white">{l}</button>
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
