"use client";
// Página da conta (ou do programa com todos os titulares): barra de ações (lançar, debitar, transferir,
// CPFs, exportar, ocultar valores), seletor de período e histórico do período com filtro e busca.
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Minus, ArrowLeftRight, Users, Upload, Eye, EyeOff, Search, ArrowDownLeft, ArrowUpRight, FileText } from "lucide-react";
import { openEntryForm } from "@/components/entry-forms";
import { openCpfManager } from "./beneficiaries";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { toast } from "@/components/feedback";
import { DateRangePicker } from "@/components/date-range";
import { rangeLabel, type DayRange } from "@/lib/day-range";
import { fmtBRL, fmtDate, fmtPts, fmtSignedPts, shortName } from "@/lib/format";
import { ENTRY_LABELS } from "@/domain/ledger";
import type { AccountsPeriod } from "@/server/services/account-month";

/** Endereço da mesma página com outro período. */
const withRange = (base: string, r: DayRange) => `${base}?${r ? `de=${r.from}&ate=${r.to}` : "periodo=tudo"}`;

export function AccountToolbar({ base, range, showValues, hasCpfs, exportQuery }: { base: string; range: DayRange; showValues: boolean; hasCpfs: boolean; exportQuery: string }) {
  const router = useRouter();
  const nav = useNav();
  async function toggleValues() {
    const r = await api("/api/preferences", "PATCH", { showValues: !showValues });
    if (!r.ok) return toast(r.erro, "error");
    refreshSafe(router);
  }
  const btn = "btn-ghost h-10 border border-line bg-panel";
  const exportHref = `/api/entries/export?${exportQuery}${range ? `&from=${range.from}&to=${range.to}` : ""}`;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-line bg-panel2/40 p-3">
      <button type="button" className="btn-primary h-10" onClick={() => openEntryForm("credit")}><Plus className="h-4 w-4" />Adicionar milhas</button>
      <button type="button" className={btn} onClick={() => openEntryForm("debit")}><Minus className="h-4 w-4" />Debitar milhas</button>
      <button type="button" className={btn} onClick={() => openEntryForm("transfer")}><ArrowLeftRight className="h-4 w-4" />Transferir milhas</button>
      {hasCpfs && <button type="button" className={btn} onClick={openCpfManager}><Users className="h-4 w-4" />Gerir CPFs</button>}
      <a className={`${btn} w-10 px-0`} href={exportHref} aria-label={`Exportar lançamentos: ${rangeLabel(range)}`} title="Exportar o período (CSV)"><Upload className="h-4 w-4" /></a>
      <button type="button" className={`${btn} w-10 px-0`} onClick={toggleValues} aria-label={showValues ? "Ocultar valores" : "Mostrar valores"} title={showValues ? "Ocultar valores" : "Mostrar valores"}>{showValues ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
      <div className="ml-auto"><DateRangePicker value={range} align="right" onChange={(r) => nav(withRange(base, r))} /></div>
    </div>
  );
}

export function MonthHistory({ data, color, showValues, fullHref, byHolder }: { data: AccountsPeriod; color: string; showValues: boolean; fullHref: string; byHolder?: boolean }) {
  const [dir, setDir] = useState<"" | "in" | "out">("");
  const [q, setQ] = useState("");
  const money = (c: number) => (showValues ? fmtBRL(c) : "R$ •••");
  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return data.entries.filter((e) => (!dir || (dir === "in" ? e.points > 0 : e.points < 0)) && (!term || e.description.toLowerCase().includes(term) || e.holder.toLowerCase().includes(term) || (ENTRY_LABELS[e.type as keyof typeof ENTRY_LABELS] ?? "").toLowerCase().includes(term)));
  }, [data.entries, dir, q]);
  const pts = rows.reduce((t, e) => t + e.points, 0);
  const cost = rows.reduce((t, e) => t + e.costCents, 0);
  const seg = (k: "in" | "out", label: string, icon: React.ReactNode) => (
    <button type="button" aria-pressed={dir === k} onClick={() => setDir(dir === k ? "" : k)} className={`flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium ${dir === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{icon}{label}</button>
  );
  return (
    <section className="card mt-4 overflow-hidden" aria-label="Histórico de transações">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <div className="mr-auto">
          <h2 className="font-semibold">Histórico de transações</h2>
          <p className="text-xs text-muted first-letter:uppercase">{rangeLabel(data.range)} · {data.entries.length} {data.entries.length === 1 ? "lançamento" : "lançamentos"}</p>
        </div>
        <div className="inline-flex gap-0.5 rounded-lg border border-line bg-panel p-0.5">{seg("out", "Saída", <ArrowDownLeft className="h-3.5 w-3.5" />)}{seg("in", "Entrada", <ArrowUpRight className="h-3.5 w-3.5" />)}</div>
        <label className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar transação..." aria-label="Buscar transação" />
        </label>
        <Link className="btn-ghost h-9 border border-line" href={fullHref}><FileText className="h-4 w-4" />Extrato completo</Link>
      </div>
      {rows.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhuma transação {dir || q ? "com esse filtro" : "neste período"}.</p> : (
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Data</th>{byHolder && <th>Titular</th>}<th>Tipo</th><th className="text-right">Quantidade</th><th className="text-right">Valor</th><th className="text-right">CPM</th><th>Descrição</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap tabular-nums">{fmtDate(e.occurredAt)}</td>
                  {byHolder && <td className="whitespace-nowrap"><Link className="hover:underline" href={`/app/programs/${e.accountId}`}>{shortName(e.holder)}</Link></td>}
                  <td><span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: color }} aria-hidden />{ENTRY_LABELS[e.type as keyof typeof ENTRY_LABELS] ?? e.type}</span>{e.status === "PENDING" && <span className="ml-1 text-xs text-amber-300">a receber</span>}</td>
                  <td className={`text-right tabular-nums font-medium ${e.points > 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(e.points)}</td>
                  <td className="text-right tabular-nums">{e.costCents ? money(Math.abs(e.costCents)) : "-"}</td>
                  <td className="text-right tabular-nums">{e.costCents && e.points ? money(Math.round((Math.abs(e.costCents) * 1000) / Math.abs(e.points))) : "-"}</td>
                  <td className="max-w-[320px] truncate text-muted" title={e.description}>{e.description}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-panel2/50 font-semibold [&>td]:border-b-0">
                <td>Totais</td>{byHolder && <td />}<td />
                <td className={`text-right tabular-nums ${pts >= 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(pts)}</td>
                <td className="text-right tabular-nums">{cost ? money(Math.abs(cost)) : "-"}</td>
                <td className="text-right tabular-nums text-muted">{fmtPts(rows.length)} itens</td><td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}
