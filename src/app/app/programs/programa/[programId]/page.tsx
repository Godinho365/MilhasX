// Programa com todos os titulares: os mesmos indicadores da conta, somados, e uma linha por titular.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { fmtBRL, fmtPts, shortName } from "@/lib/format";
import { rangeLabel } from "@/lib/day-range";
import { marketValueCents } from "@/domain/ledger";
import { accountsPeriod, periodFromQuery } from "@/server/services/account-month";
import { AccountToolbar, MonthHistory } from "../../[id]/month";
import { PeriodCards } from "../../[id]/period-cards";

export default async function ProgramPage({ params, searchParams }: { params: Promise<{ programId: string }>; searchParams: Promise<{ de?: string; ate?: string; periodo?: string }> }) {
  const user = await requirePageUser();
  const { programId } = await params;
  const range = periodFromQuery(await searchParams);
  const [program, accounts, pref] = await Promise.all([
    prisma.program.findUnique({ where: { id: programId } }),
    prisma.account.findMany({ where: { userId: user.id, programId, archived: false }, select: { id: true } }),
    prisma.userPreference.findUnique({ where: { userId: user.id }, select: { showValues: true } }),
  ]);
  if (!program || !accounts.length) notFound();
  const showValues = pref?.showValues !== false;
  const money = (c: number | null) => (showValues ? fmtBRL(c) : "R$ •••");
  const m = await accountsPeriod(user.id, accounts.map((a) => a.id), range);
  const rows = [...m.rows].sort((a, b) => b.balance - a.balance);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ProgramLogo programId={program.id} name={program.name} color={program.color} version={program.logoUpdatedAt?.getTime().toString()} size={44} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
          <p className="text-sm text-muted">Todos os titulares · {rows.length} {rows.length === 1 ? "conta" : "contas"}</p>
        </div>
      </div>

      <AccountToolbar base={`/app/programs/programa/${program.id}`} range={range} showValues={showValues} hasCpfs={false} exportQuery={`programId=${program.id}`} />
      <PeriodCards m={m} showValues={showValues} marketValueCents={marketValueCents(m.balance, program.marketValueCpmCents)} />

      <section className="card mt-4 overflow-hidden" aria-label="Contas por titular">
        <div className="border-b border-line px-5 py-3">
          <h2 className="font-semibold">Por titular</h2>
          <p className="text-xs text-muted first-letter:uppercase">Saldo e custo de hoje; vendas e lucro de {rangeLabel(range).toLowerCase()}. Clique para abrir a conta.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Titular</th><th className="text-right">Saldo</th><th className="text-right">CPM</th><th className="text-right">Valor investido</th><th className="text-right">CPFs</th><th>Clube</th><th className="text-right">Vendas</th><th className="text-right">Lucro</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-panel2/40">
                  <td className="font-medium"><Link href={`/app/programs/${r.id}`} className="hover:underline" title={r.holder}>{shortName(r.holder)}</Link></td>
                  <td className="text-right tabular-nums">{fmtPts(r.balance)}</td>
                  <td className="text-right tabular-nums">{money(r.cpmCents)}</td>
                  <td className="text-right tabular-nums">{money(r.stockCents)}</td>
                  <td className="text-right tabular-nums">{r.cpf?.limit != null ? `${r.cpf.used}/${r.cpf.limit}` : "-"}</td>
                  <td>{r.club.active ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Ativo</span> : <span className="text-xs text-muted">Inativo</span>}</td>
                  <td className="text-right tabular-nums">{r.sales.count}</td>
                  <td className={`text-right tabular-nums ${r.sales.profitCents > 0 ? "text-ok" : r.sales.profitCents < 0 ? "text-bad" : ""}`}>{money(r.sales.profitCents)}</td>
                  <td><Link href={`/app/programs/${r.id}`} className="btn-subtle h-7 w-7 px-0" aria-label={`Abrir a conta de ${r.holder}`}><ChevronRight className="h-4 w-4" /></Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <MonthHistory data={m} color={program.color} showValues={showValues} fullHref={`/app/entries?programId=${program.id}`} byHolder />
    </>
  );
}
