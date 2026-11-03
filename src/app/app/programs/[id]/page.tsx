import { notFound } from "next/navigation";
import { Gift } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { accountDetail, credentialsEnabled } from "@/server/services/accounts";
import { DomainError, prisma } from "@/server/db";
import { fmtPts, shortName } from "@/lib/format";
import { Recurrences, Credentials } from "./client";
import { BeneficiaryLimit } from "./beneficiaries";
import { bonusUsage } from "@/server/services/transfer-bonus";
import { brWindows } from "@/domain/brasilia";
import { accountsPeriod, periodFromQuery } from "@/server/services/account-month";
import { AccountToolbar, MonthHistory } from "./month";
import { PeriodCards } from "./period-cards";
import { AccountHeader } from "./header";

export default async function AccountPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ de?: string; ate?: string; periodo?: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
  const range = periodFromQuery(await searchParams);
  let d;
  try {
    d = await accountDetail(user.id, id);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.id }, select: { showValues: true } });
  const { account: a, stats } = d;
  const [[bonus], m] = await Promise.all([bonusUsage(user.id, new Date(), a.id), accountsPeriod(user.id, [a.id], range)]);
  const showValues = pref?.showValues !== false;
  const hasCpfs = a.program.kind === "MILES" || a.beneficiaryLimit != null;

  return (
    <>
      <AccountHeader
        account={{ id: a.id, nickname: a.nickname, cpfAvailable: a.cpfAvailable, transferBonusPct: a.transferBonusPct, transferBonusCap: a.transferBonusCap, tags: a.tags, programName: a.program.name, holderName: a.holder.name, archived: a.archived, pinned: a.pinned, holderId: a.holderId }}
        title={a.nickname || a.holder.name}
        program={{ id: a.program.id, code: a.program.code, color: a.program.color, logo: a.program.logoUpdatedAt?.getTime().toString() }}
        phone={a.holder.phone}
      />

      <AccountToolbar base={`/app/programs/${a.id}`} range={range} showValues={showValues} hasCpfs={hasCpfs} exportQuery={`accountId=${a.id}`} />

      <PeriodCards m={m} showValues={showValues} marketValueCents={stats.marketValueCents} />

      {/* Programas de milhas limitam quantos CPFs diferentes podem receber emissões */}
      {hasCpfs && <div id="cpfs" className="mt-4 scroll-mt-20"><BeneficiaryLimit accountId={a.id} title={`${a.program.name} ${shortName(a.holder.name)}`} /></div>}
      {bonus && <div className="mt-4"><BonusCapCard b={bonus} /></div>}

      <Recurrences
        accountId={a.id}
        items={d.recurrences.map((r) => ({ id: r.id, type: r.type, description: r.description, points: r.points, costCents: r.costCents, frequency: r.frequency, nextDate: r.nextDate.toISOString(), notify: r.notify, active: r.active }))}
      />

      <MonthHistory data={m} color={a.program.color} showValues={showValues} fullHref={`/app/entries?accountId=${a.id}`} />
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
