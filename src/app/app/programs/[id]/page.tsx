import Link from "next/link";
import { ProgramLogo } from "@/components/program-logo";
import { notFound } from "next/navigation";
import { Wallet, Target, Package, DollarSign, FileText, Gift } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { accountDetail, credentialsEnabled } from "@/server/services/accounts";
import { DomainError, prisma } from "@/server/db";
import { fmtBRL, fmtPts, fmtSignedPts } from "@/lib/format";
import { ENTRY_LABELS } from "@/domain/ledger";
import { ProgramDot } from "@/components/stat";
import { Recurrences, Credentials } from "./client";
import { BeneficiaryLimit } from "./beneficiaries";
import { bonusUsage } from "@/server/services/transfer-bonus";
import { brWindows } from "@/domain/brasilia";

const dm = (d: Date) => d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

function IconStat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-2">
        <p className="kicker">{label}</p>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent-light">{icon}</span>
      </div>
      <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]">{value}</p>
    </div>
  );
}

function SectionHead({ icon, tone, title, sub, action }: { icon: React.ReactNode; tone: string; title: string; sub: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold">{title}</h2>
        <p className="text-sm text-muted">{sub}</p>
      </div>
      {action}
    </div>
  );
}

export default async function AccountPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageUser();
  const { id } = await params;
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
  const [bonus] = await bonusUsage(user.id, new Date(), a.id);

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ProgramLogo programId={a.program.id} name={a.program.name} color={a.program.color} version={a.program.logoUpdatedAt?.getTime().toString()} size={44} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{a.program.name}</h1>
          <p className="flex items-center gap-1.5 text-sm text-muted"><ProgramDot color={a.program.color} />{a.holder.name}</p>
        </div>
      </div>

      {/* Programas de milhas limitam quantos CPFs diferentes podem receber emissões */}
      {(a.program.kind === "MILES" || a.beneficiaryLimit != null) && <div className="mb-4"><BeneficiaryLimit accountId={a.id} /></div>}
      {bonus && <div className="mb-4"><BonusCapCard b={bonus} /></div>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <IconStat label="Saldo atual" value={fmtPts(stats.balance)} icon={<Wallet className="h-5 w-5" />} />
        <IconStat label="Custo do milheiro" value={money(stats.cpmCents)} icon={<Target className="h-5 w-5" />} />
        <IconStat label="Pontos a receber" value={fmtPts(stats.pendingPoints)} icon={<Package className="h-5 w-5" />} />
        <IconStat label="Valor em reais" value={money(stats.marketValueCents)} icon={<DollarSign className="h-5 w-5" />} />
      </div>


      <div className="mt-4 grid gap-4 [&>*]:min-w-0">
        <section className="card card-pad">
          <SectionHead
            icon={<FileText className="h-5 w-5" />}
            tone="bg-accent-soft text-accent-light"
            title="Lançamentos Recentes"
            sub="Últimas movimentações"
            action={<Link href={`/app/entries?accountId=${a.id}`} className="text-sm font-medium text-accent-light hover:underline">Ver todos</Link>}
          />
          {d.recent.length === 0 ? <p className="rounded-xl bg-panel2 py-10 text-center text-sm text-muted">Nenhum lançamento nesta conta.</p> : (
            <ul className="space-y-2">
              {d.recent.map((e) => {
                return (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl bg-panel2/70 px-4 py-3">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: a.program.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.description}</p>
                      <p className="truncate text-xs text-muted">
                        {dm(e.occurredAt)}
                        {e.description !== ENTRY_LABELS[e.type] && ` · ${ENTRY_LABELS[e.type]}`}
                        {e.status === "PENDING" && <span className="text-amber-300"> · a receber</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums ${e.points > 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(e.points)}</p>
                      <p className="text-xs tabular-nums text-muted">{e.costCents !== 0 ? money(Math.abs(e.costCents)) : e.points > 0 ? "Orgânico" : "—"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

      </div>

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
        {full
          ? "Limite do mês atingido: novas transferências entram sem bônus até a renovação."
          : `Ainda cabem ${fmtPts(b.left)} milhas de bônus${b.transferable ? `: transfira até ${fmtPts(b.transferable)} pontos com ${b.bonusPct}% de bônus` : ""}.`}
      </p>
    </section>
  );
}
