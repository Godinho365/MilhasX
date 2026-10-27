"use client";
import { useState } from "react";
import { BarChart3, ChevronRight, Layers, ListOrdered, TrendingUp } from "lucide-react";
import { fmtBRL, fmtPts, fmtDate } from "@/lib/format";
import type { PageDesign } from "@/domain/page-design";

// "Gestão de Milhas": painel que o titular vê (saldo total, evolução, contas, extrato e relatório).

export type PainelData = {
  holder: string;
  accounts: { id: string; program: string; color: string; balance: number; nickname: string | null; cpmCents: number | null; valueCents: number }[];
  series: { month: string; total: number }[];
  earned12m: number;
  entries: { id: string; label: string; pending: boolean; points: number; program: string; date: string }[];
};

export const SAMPLE_PAINEL: PainelData = {
  holder: "Roberto Almeida",
  accounts: [
    { id: "a1", program: "Azul Fidelidade", color: "#2563eb", balance: 124000, nickname: null, cpmCents: 1978, valueCents: 248000 },
    { id: "a2", program: "Smiles", color: "#f97316", balance: 114000, nickname: null, cpmCents: 2204, valueCents: 228000 },
    { id: "a3", program: "LATAM Pass", color: "#e11d48", balance: 65300, nickname: null, cpmCents: null, valueCents: 156700 },
    { id: "a4", program: "Livelo", color: "#db2777", balance: 35600, nickname: null, cpmCents: 3411, valueCents: 106800 },
  ],
  series: [210, 228, 245, 260, 252, 275, 290, 284, 300, 312, 325, 338.9].map((t, i) => ({ month: `2026-${String(i + 1).padStart(2, "0")}`, total: Math.round(t * 1000) })),
  earned12m: 540000,
  entries: [
    { id: "e1", label: "Transferência", pending: false, points: 60000, program: "Smiles", date: "2026-10-12T12:00:00Z" },
    { id: "e2", label: "Venda", pending: false, points: -42000, program: "Azul Fidelidade", date: "2026-10-03T12:00:00Z" },
    { id: "e3", label: "Crédito", pending: true, points: 12000, program: "Livelo", date: "2026-09-28T12:00:00Z" },
  ],
};

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function Spark({ values }: { values: number[] }) {
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 300, 70 - ((v - min) / (max - min || 1)) * 60]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg viewBox="0 0 300 80" className="mt-3 h-20 w-full" aria-hidden preserveAspectRatio="none">
      <path d={`${d} L300,80 L0,80 Z`} fill="rgb(var(--lime, 141 230 112) / 0.15)" />
      <path d={d} fill="none" stroke="rgb(var(--lime, 141 230 112))" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function PainelView({ agency, design, data, footer }: { agency: string; design: PageDesign["gestaoMilhas"]; data: PainelData; footer?: React.ReactNode }) {
  const [tab, setTab] = useState<"contas" | "extrato" | "relatorio">("contas");
  const total = data.accounts.reduce((s, a) => s + a.balance, 0);
  const value = data.accounts.reduce((s, a) => s + a.valueCents, 0);
  const s = data.series;
  const growth = s.length >= 4 && s[s.length - 4]!.total > 0 ? Math.round(((total - s[s.length - 4]!.total) / s[s.length - 4]!.total) * 100) : null;
  const initials = data.holder.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
  return (
    <>
      <p className="mb-3 text-center text-sm text-muted">{agency}</p>
      <section className="rounded-3xl p-5 text-[#fff] sm:p-6" style={{ backgroundColor: "rgb(var(--hero, 26 46 22))" }} aria-label="Seu painel">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--lime,141_230_112))] font-bold text-zinc-900">{initials}</span>
          <span><span className="block text-lg font-bold">Olá, {data.holder.split(" ")[0]}!</span><span className="block text-sm text-[#fff]/60">{design.title}</span></span>
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wider text-[#fff]/60">Saldo total</p>
        <p className="text-4xl font-bold tabular-nums">{fmtPts(total)} <span className="text-base font-normal text-[#fff]/60">milhas e pontos</span></p>
        {growth != null && growth !== 0 && <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-[#fff]/10 px-2.5 py-1 text-xs font-semibold text-[rgb(var(--lime,141_230_112))]"><TrendingUp className="h-3.5 w-3.5" />{growth > 0 ? "+" : ""}{growth}% nos últimos 3 meses</span>}
        <Spark values={s.map((x) => x.total)} />
        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          {[["Contas", String(data.accounts.length)], ["Em 12 meses", `+${fmtPts(data.earned12m)}`], ["Valor estimado", value > 0 ? fmtBRL(value) : "—"]].map(([k, v]) => (
            <div key={k} className="rounded-2xl bg-[#fff]/10 p-3"><dt className="text-xs text-[#fff]/60">{k}</dt><dd className="font-semibold">{v}</dd></div>
          ))}
        </dl>
        {data.accounts.length > 0 && (
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Saldos">
            {data.accounts.map((a) => (
              <li key={a.id} className="flex shrink-0 items-center gap-2 rounded-full bg-[#fff]/10 py-1.5 pl-1.5 pr-3 text-xs">
                <span className="h-6 w-6 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                <span><span className="block text-[#fff]/70">{a.program}</span><span className="font-semibold">{fmtPts(a.balance)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {design.text && <p className="mt-3 px-1 text-sm text-muted">{design.text}</p>}

      <div className="mt-5">
        {tab === "contas" && (
          <section aria-label="Suas contas">
            <h2 className="text-xl font-bold">Suas contas</h2>
            <p className="mb-3 text-sm text-muted">Saldo e custo médio de cada programa.</p>
            {data.accounts.length === 0 ? <p className="card p-4 text-sm text-muted">Nenhuma conta cadastrada.</p> : (
              <ul className="space-y-3">
                {data.accounts.map((a) => (
                  <li key={a.id} className="card flex items-center gap-3 p-4">
                    <span className="h-10 w-10 shrink-0 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                    <span className="min-w-0 flex-1"><span className="block font-semibold">{a.nickname || a.program}</span><span className="block text-xs text-muted">Custo médio {a.cpmCents != null ? `${fmtBRL(a.cpmCents)}/mil` : "—"}</span></span>
                    <span className="text-right"><span className="block text-xs text-muted">Saldo</span><span className="font-bold tabular-nums">{fmtPts(a.balance)}</span></span>
                    <ChevronRight className="h-4 w-4 text-muted" />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === "extrato" && (
          <section aria-label="Extrato">
            <h2 className="mb-3 text-xl font-bold">Extrato</h2>
            {data.entries.length === 0 ? <p className="card p-4 text-sm text-muted">Sem movimentações.</p> : (
              <ul className="card divide-y divide-line text-sm">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-20 shrink-0 text-muted">{fmtDate(e.date)}</span>
                    <span className="min-w-0 flex-1 truncate">{e.label} · {e.program}{e.pending && <span className="ml-1.5 text-xs text-amber-400">(a receber)</span>}</span>
                    <span className={`font-semibold tabular-nums ${e.points < 0 ? "text-red-400" : "text-green-400"}`}>{e.points > 0 ? "+" : ""}{fmtPts(e.points)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
        {tab === "relatorio" && (
          <section aria-label="Relatório">
            <h2 className="mb-3 text-xl font-bold">Relatório</h2>
            <table className="card w-full overflow-hidden text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="px-4 py-2 font-semibold">Mês</th><th className="px-4 py-2 text-right font-semibold">Saldo no fim do mês</th></tr></thead>
              <tbody className="divide-y divide-line">
                {[...s].reverse().map((m) => <tr key={m.month}><td className="px-4 py-2">{MONTHS[Number(m.month.slice(5, 7)) - 1]}/{m.month.slice(0, 4)}</td><td className="px-4 py-2 text-right tabular-nums">{fmtPts(m.total)}</td></tr>)}
              </tbody>
            </table>
          </section>
        )}
        {footer}
      </div>

      <nav className="fixed inset-x-0 bottom-3 z-20 mx-auto flex max-w-sm gap-1 rounded-2xl p-1.5 text-[#fff] shadow-2xl" style={{ backgroundColor: "rgb(28 30 26)", width: "calc(100% - 1.5rem)" }} aria-label="Seções do painel">
        {([["contas", "Contas", Layers], ["extrato", "Extrato", ListOrdered], ["relatorio", "Relatório", BarChart3]] as const).map(([k, l, Icon]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)} className={`flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-xs font-semibold ${tab === k ? "bg-[#fff]/10 text-[rgb(var(--lime,141_230_112))]" : "text-[#fff]/60"}`}><Icon className="h-4 w-4" />{l}</button>
        ))}
      </nav>
    </>
  );
}
