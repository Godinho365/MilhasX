import { ProgramLogo } from "@/components/program-logo";
import { notFound } from "next/navigation";
import { Wallet, Package, DollarSign, Gift, Percent, CreditCard, Users, Calculator, CalendarDays, TrendingUp } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { accountDetail, credentialsEnabled } from "@/server/services/accounts";
import { DomainError, prisma } from "@/server/db";
import { fmtBRL, fmtDate, fmtPts, monthLabel, shortName } from "@/lib/format";
import { ProgramDot } from "@/components/stat";
import { Recurrences, Credentials } from "./client";
import { BeneficiaryLimit } from "./beneficiaries";
import { bonusUsage } from "@/server/services/transfer-bonus";
import { brWindows } from "@/domain/brasilia";
import { accountMonth, monthOrCurrent, shiftMonth } from "@/server/services/account-month";
import { AccountToolbar, MonthHistory } from "./month";

/** Cartão de indicador: rótulo, valor, legenda e ícone no canto. */
function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="text-muted" aria-hidden>{icon}</span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${tone ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ mes?: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const month = monthOrCurrent((await searchParams).mes);
  let d;
  try {
    d = await accountDetail(user.id, id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { showValues: true } });
  const money = (c: number | null) => (pref?.showValues === false ? "R$ •••" : fmtBRL(c));
  const { account: a, stats } = d;
  const [[bonus], m] = await Promise.all([bonusUsage(user.id, new Date(), a.id), accountMonth(user.id, a.id, month)]);
  const showValues = pref?.showValues !== false;
  const mName = monthLabel(month).split(" ")[0]!.toLowerCase();
  const hasCpfs = a.program.kind === "MILES" || a.beneficiaryLimit != null;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ProgramLogo programId={a.program.id} name={a.program.name} color={a.program.color} version={a.program.logoUpdatedAt?.getTime().toString()} size={44} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.program.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted"><ProgramDot color={a.program.color} />{a.holder.name}</p>
        </div>
      </div>

      <AccountToolbar accountId={a.id} month={month} prev={shiftMonth(month, -1)} next={shiftMonth(month, 1)} showValues={showValues} hasCpfs={hasCpfs} />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard label="Lucro no mês" value={money(m.sales.profitCents)} sub={`${m.sales.count} ${m.sales.count === 1 ? "venda" : "vendas"} em ${mName}`} icon={<DollarSign className="h-5 w-5" />} tone={m.sales.profitCents > 0 ? "text-ok" : m.sales.profitCents < 0 ? "text-bad" : ""} />
        <StatCard label="Total vendido" value={money(m.sales.totalCents)} sub={`vendas desta conta em ${mName}`} icon={<TrendingUp className="h-5 w-5" />} />
        <StatCard label="Rendimento" value={m.sales.roePct == null ? "-" : `${m.sales.roePct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`} sub="retorno sobre o custo das milhas vendidas" icon={<Percent className="h-5 w-5" />} />
        <StatCard label="Saldo atual" value={fmtPts(stats.balance)} sub="milhas" icon={<Wallet className="h-5 w-5" />} />
        <StatCard label="CPM" value={money(stats.cpmCents)} sub="custo por milheiro" icon={<CreditCard className="h-5 w-5" />} />
        <StatCard label="Valor investido" value={money(m.stockCents)} sub="custo das milhas em saldo" icon={<DollarSign className="h-5 w-5" />} />
        <StatCard label="Pontos a receber" value={fmtPts(stats.pendingPoints)} sub={`valor de mercado do saldo: ${money(stats.marketValueCents)}`} icon={<Package className="h-5 w-5" />} />
        <StatCard label="CPFs usados" value={m.cpf?.limit != null ? `${m.cpf.used}/${m.cpf.limit}` : "-"} sub={m.cpf?.limit != null ? `${Math.max(0, m.cpf.limit - m.cpf.used)} disponíveis` : "sem limite de CPFs"} icon={<Users className="h-5 w-5" />} />
        <StatCard label="Média utilizável" value={m.perCpf != null ? fmtPts(m.perCpf) : "-"} sub="milhas por CPF livre" icon={<Calculator className="h-5 w-5" />} />
        <StatCard label="Tempo de clube" value={m.club.active ? (m.club.months ? `${m.club.months} ${m.club.months === 1 ? "mês" : "meses"}` : "Este mês") : "Sem clube"} sub={m.club.since ? `${m.club.active ? "Membro" : "Primeiro clube"} desde ${fmtDate(m.club.since)}` : "nenhum ponto de clube lançado"} icon={<CalendarDays className="h-5 w-5" />} tone={m.club.active ? "" : "text-muted"} />
      </div>

      <MonthHistory data={m} accountId={a.id} color={a.program.color} showValues={showValues} />

      {/* Programas de milhas limitam quantos CPFs diferentes podem receber emissões */}
      {hasCpfs && <div id="cpfs" className="mt-4 scroll-mt-20"><BeneficiaryLimit accountId={a.id} title={`${a.program.name} ${shortName(a.holder.name)}`} /></div>}
      {bonus && <div className="mt-4"><BonusCapCard b={bonus} /></div>}

      <Recurrences
        accountId={a.id}
        items={d.recurrences.map((r) => ({ id: r.id, type: r.type, description: r.description, points: r.points, costCents: r.costCents, frequency: r.frequency, nextDate: r.nextDate.toISOString(), notify: r.notify, active: r.active }))}
      />
      <Credentials accountId={a.id} saved={d.credential ? d.credential.updatedAt.toISOString() : null} enabled={credentialsEnabled()} />
    </>
  );
}

/** Limite mensal do bônus de transferência: quanto já entrou de bônus no mês e quanto ainda cabe. */
function BonusCapCard({ b }: { b: Awaited<ReturnType<typeof bonusUsage>>[number] }) {
  const [y, m] = brWindows().month.split("-").map(Number);
  const renew = new Date(Date.UTC(y!, m!, 1)).toLocaleDateString("pt-BR", { timeZone: "UTC" });
  const full = b.left === 0;
  return (
    <section className="card card-pad" aria-label="Bônus de transferência do mês">
      <div className="flex flex-wrap items-center gap-2">
        <Gift className="h-4 w-4 text-muted" />
        <h2 className="text-sm font-semibold">Bônus de transferência do mês</h2>
        {!b.clubActive && <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-medium text-amber-300">clube inativo: sem bônus</span>}
        <span className="ml-auto text-xs text-muted">Renova em {renew}</span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {fmtPts(b.used)} <span className="text-base font-normal text-muted">/ {fmtPts(b.cap)} milhas de bônus usadas</span>
      </p>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-panel2" role="progressbar" aria-valuemin={0} aria-valuemax={b.cap} aria-valuenow={b.used}>
        <div className={`h-full rounded-full ${full ? "bg-amber-400" : "bg-accent"}`} style={{ width: `${b.pctUsed}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted">
        {!b.clubActive
          ? `Sem clube ativo nesta conta: transferências entram sem o bônus de ${b.bonusPct}%.`
          : full
          ? "Limite do mês atingido: novas transferências entram sem bônus até a renovação."
          : `Ainda cabem ${fmtPts(b.left)} milhas de bônus${b.transferable ? `: transfira até ${fmtPts(b.transferable)} pontos com ${b.bonusPct}% de bônus` : ""}.`}
      </p>
    </section>
  );
}
