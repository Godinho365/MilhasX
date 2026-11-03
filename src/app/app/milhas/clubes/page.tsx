import Link from "next/link";
import { Crown, Coins, Percent, CalendarClock } from "lucide-react";
import { requirePageUser, selectedHolderId, holderScopeLabel } from "@/server/session";
import { listClubs } from "@/server/services/miles";
import { PageHeader, Stat } from "@/components/stat";
import { Empty } from "@/components/ui";
import { fmtBRL, fmtDate, fmtPts } from "@/lib/format";

const FREQ: Record<string, string> = { DAILY: "Diário", WEEKLY: "Semanal", MONTHLY: "Mensal", QUARTERLY: "Trimestral", YEARLY: "Anual" };

export default async function ClubsPage() {
  const user = await requirePageUser();
  const holderId = await selectedHolderId(user.id);
  const [{ rows, totals }, scope] = await Promise.all([listClubs(user.id, holderId), holderScopeLabel(holderId)]);
  return (
    <>
      <PageHeader title="Clubes" subtitle={`Clubes de pontos das suas contas: pontos, mensalidade, custo do milheiro e renovação · ${scope}`} />
      {rows.length === 0 ? (
        <Empty title="Nenhum clube cadastrado" icon={<Crown className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Na página da conta, em Lançamentos Recorrentes, cadastre o clube (tipo Clube) com os pontos e a mensalidade.</p>
          <Link href="/app/programs" className="btn-primary">Ir para as contas</Link>
        </Empty>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
            <Stat icon={<Crown className="h-4 w-4" />} label="Clubes ativos" value={String(totals.active)} hint={`${rows.length} cadastrados`} />
            <Stat icon={<Coins className="h-4 w-4" />} label="Pontos por mês" value={fmtPts(totals.monthlyPoints)} hint="soma dos clubes ativos" />
            <Stat icon={<CalendarClock className="h-4 w-4" />} label="Mensalidades" value={fmtBRL(totals.monthlyCents)} hint="por mês, nos clubes ativos" />
            <Stat icon={<Percent className="h-4 w-4" />} label="Custo do milheiro" value={totals.cpmCents == null ? "-" : fmtBRL(totals.cpmCents)} hint="mensalidade ÷ pontos × 1.000" accent />
          </div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Clube</th><th>Situação</th><th className="text-right">Pontos</th><th className="text-right">Mensalidade</th>
                    <th className="text-right" title="Mensalidade ÷ pontos × 1.000">Custo milheiro</th><th>Próxima cobrança</th><th className="text-right" title="Bônus da conta em transferências enquanto o clube está ativo">Bônus transf.</th><th>Lembrete</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="max-w-[260px]">
                        <Link href={`/app/programs/${r.accountId}`} className="flex items-center gap-2 font-medium hover:underline">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden /><span className="truncate">{r.label}</span>
                        </Link>
                        <span className="block truncate text-xs text-muted">{r.description}</span>
                      </td>
                      <td>{r.active ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Ativo</span> : <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">Pausado</span>}</td>
                      <td className="text-right tabular-nums">{fmtPts(r.points)}<span className="block text-xs text-muted">{FREQ[r.frequency]}{r.interval > 1 ? ` (a cada ${r.interval})` : ""}</span></td>
                      <td className="text-right tabular-nums">{r.costCents ? fmtBRL(r.costCents) : "-"}</td>
                      <td className="text-right tabular-nums">{r.cpmCents == null ? "-" : fmtBRL(r.cpmCents)}</td>
                      <td className="whitespace-nowrap tabular-nums">{r.active ? fmtDate(r.nextDate) : "-"}{r.endDate && <span className="block text-xs text-muted">até {fmtDate(r.endDate)}</span>}</td>
                      <td className="text-right tabular-nums">{r.bonusPct ? `${r.bonusPct}%` : "-"}{r.bonusCap ? <span className="block text-xs text-muted">até {fmtPts(r.bonusCap)}/mês</span> : null}</td>
                      <td className="text-xs text-muted">{r.notify ? "Avisa" : "Sem aviso"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">Para mudar pontos, mensalidade ou pausar, abra a conta e edite o lançamento recorrente do clube.</p>
        </>
      )}
    </>
  );
}
