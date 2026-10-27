import { MobileTabs, MobileTab } from "@/components/mobile-tabs";
import Link from "next/link";
import { HandCoins, TrendingUp, Scale, ScrollText, ShoppingBag } from "lucide-react";
import { requirePageUser, selectedHolderId } from "@/server/session";
import { walletSummary, evolutionByHolder, activationProgress, pendingBreakdown, overviewData } from "@/server/services/wallet";
import { salesDashboard } from "@/server/services/extras";
import { prisma } from "@/server/db";
import { Stat, PageHeader } from "@/components/stat";
import { StatBreakdown, type Breakdown } from "@/components/stat-breakdown";
import { Empty } from "@/components/ui";
import { VIEWS } from "@/lib/dashboard-views";
import { ENTRY_LABELS, type EntryType } from "@/domain/ledger";
import { Checklist } from "./checklist";
import { HoldersTable } from "./holders-table";
import { HolderEvolution, TotalEvolution, MonthlySales, HBar, CreditsDebits } from "@/components/charts";
import { fmtBRL, fmtPts, fmtSignedPts } from "@/lib/format";

type Money = (c: number | null) => string;

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePageUser();
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.id } });
  const asked = (await searchParams).view;
  const view = VIEWS.find((v) => v.key === asked)?.key ?? VIEWS.find((v) => v.key === pref?.dashboardView)?.key ?? "gestao";
  const hide = pref?.showValues === false;
  const money: Money = (c) => (hide ? "R$ •••" : fmtBRL(c));
  const holderId = await selectedHolderId(user.id);
  const progress = await activationProgress(user.id);
  const label = VIEWS.find((v) => v.key === view)!;
  const holder = holderId ? await prisma.holder.findUnique({ where: { id: holderId }, select: { name: true } }) : null;

  return (
    <>
      <PageHeader title={label.label} subtitle={holder ? `Titular: ${holder.name}` : `${label.sub} · Todos os titulares`} />
      {!pref?.checklistHidden && progress.done < progress.steps.length && <Checklist steps={progress.steps} done={progress.done} />}
      {view === "vendas" ? <SalesView userId={user.id} money={money} /> : view === "visao-geral" ? <OverviewView userId={user.id} holderId={holderId} money={money} /> : <ManagementView userId={user.id} holderId={holderId} money={money} hide={hide} />}
    </>
  );
}

type Summary = Awaited<ReturnType<typeof walletSummary>>;
type Pending = Awaited<ReturnType<typeof pendingBreakdown>>;
const pts = (n: number) => `${fmtPts(n)} pts`;

/** Os 4 indicadores; o ⇕ de cada um abre o detalhamento por titular e programa (como na referência). */
function WalletStats({ s, pending, money }: { s: Summary; pending: Pending; money: Money }) {
  const byHolder = (value: (a: Summary["accounts"][number]) => string | null, groupValue?: (h: Summary["holders"][number]) => string) =>
    s.holders.map((h) => {
      const rows = s.accounts
        .filter((a) => a.holderId === h.id)
        .flatMap((a) => {
          const v = value(a);
          return v == null ? [] : [{ label: `${a.programName} ${a.holderName}`, value: v, color: a.programColor }];
        });
      return { name: h.name, count: rows.length, value: groupValue?.(h), rows };
    }).filter((g) => g.rows.length > 0);

  const balance: Breakdown = { title: "Saldo por programa", groups: byHolder((a) => pts(a.balance), (h) => pts(h.balance)), footer: { label: "Total", value: pts(s.totals.balance) }, empty: "Nenhuma conta ainda." };
  const cost: Breakdown = { title: "Custo por programa", groups: byHolder((a) => (a.cpmCents == null || a.costCents === 0 ? null : money(a.cpmCents))), footer: { label: "Média ponderada", value: money(s.totals.cpmCents) }, empty: "Nenhuma conta com custo." };
  const value: Breakdown = { title: "Valor por programa", groups: byHolder((a) => money(a.marketValueCents), (h) => money(h.marketValueCents)), footer: { label: "Total", value: money(s.totals.marketValueCents) } };
  const toReceive: Breakdown = {
    title: "Detalhamento",
    groups: [
      { name: "Compras pendentes", rows: pending.purchases.map((p) => ({ label: `${p.storeName} · ${p.account.program.name} ${p.account.holder.name}`, value: pts(p.expectedPoints), color: p.account.program.color })) },
      { name: "Faturas de cartão", rows: pending.invoices.map((e) => ({ label: `${e.invoice!.card.name} · ${e.account.program.name} ${e.account.holder.name}`, value: pts(e.points), color: e.account.program.color })) },
      ...(pending.others.length ? [{ name: "Transferências e outros", rows: pending.others.map((e) => ({ label: e.description, value: pts(e.points), color: e.account.program.color })) }] : []),
    ],
    footer: { label: "Total", value: pts(pending.total) },
  };
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatBreakdown label="Saldo total" value={fmtPts(s.totals.balance)} breakdown={balance} />
      <StatBreakdown label="Custo do milheiro" value={money(s.totals.cpmCents)} breakdown={cost} />
      <StatBreakdown label="Pontos a receber" value={fmtPts(pending.total)} breakdown={toReceive} />
      <StatBreakdown label="Valor em reais" value={money(s.totals.marketValueCents)} breakdown={value} />
    </div>
  );
}

/** Card com ícone colorido, título, subtítulo e link opcional (padrão dos blocos do painel). */
function Panel({ icon, tone, title, subtitle, link, children }: { icon: React.ReactNode; tone: string; title: string; subtitle: string; link?: { href: string; label: string }; children: React.ReactNode }) {
  return (
    <section className="card card-pad min-w-0">
      <div className="mb-4 flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          <p className="text-sm text-muted">{subtitle}</p>
        </div>
        {link && <Link href={link.href} className="shrink-0 text-sm font-medium text-accent-light hover:underline">{link.label}</Link>}
      </div>
      {children}
    </section>
  );
}

async function ManagementView({ userId, holderId, money, hide }: { userId: string; holderId?: string; money: Money; hide: boolean }) {
  const from = new Date(Date.now() - 90 * 86400_000);
  const [s, evo, pending] = await Promise.all([walletSummary(userId, holderId), evolutionByHolder(userId, { holderId, from }), pendingBreakdown(userId, holderId)]);
  return (
    <>
      <WalletStats s={s} pending={pending} money={money} />
      <div className="mt-4">
        {s.holders.length === 0 ? (
          <div className="card card-pad text-sm text-muted">
            Nenhuma conta ainda. <Link className="font-medium text-accent-light" href="/app/programs">Cadastre um titular e suas contas</Link> para começar.
          </div>
        ) : (
          <HoldersTable
            hide={hide}
            holders={s.holders.map((h) => ({ id: h.id, name: h.name, accounts: h.accounts, balance: h.balance, cpmCents: h.cpmCents ?? null, valueCents: h.marketValueCents }))}
            accounts={s.accounts.map((a) => ({ holderId: a.holderId, programId: a.programId, logo: a.programLogo, program: a.programName, color: a.programColor, balance: a.balance, cpmCents: a.cpmCents, pending: a.pendingPoints }))}
          />
        )}
      </div>
      {evo.holders.length > 0 && (
        <section className="card card-pad mt-4">
          <HolderEvolution holders={evo.holders} points={evo.points} costs={evo.costs} />
        </section>
      )}
    </>
  );
}

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const dayMonth = (d: Date) => `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
const CATEGORY: Partial<Record<EntryType, string>> = { TRANSFER_IN: "Transferência", TRANSFER_OUT: "Transferência", TRANSFER_BONUS: "Bônus de pontos" };

async function OverviewView({ userId, holderId, money }: { userId: string; holderId?: string; money: Money }) {
  const from = new Date(Date.now() - 90 * 86400_000);
  const [s, evo, pending, o] = await Promise.all([
    walletSummary(userId, holderId),
    evolutionByHolder(userId, { holderId, from }),
    pendingBreakdown(userId, holderId),
    overviewData(userId, holderId),
  ]);
  const total = evo.points.map((p) => ({ date: String(p.date), balance: evo.holders.reduce((sum, h) => sum + Number(p[h.id] ?? 0), 0) }));
  return (
    <MobileTabs tabs={[["geral", "Visão Geral"], ["evolucao", "Evolução"], ["recentes", "Recentes"]]}>
      <MobileTab k="geral"><WalletStats s={s} pending={pending} money={money} /></MobileTab>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <MobileTab k="evolucao"><Panel icon={<TrendingUp className="h-5 w-5" />} tone="bg-blue-500/15 text-blue-400" title="Evolução do Saldo" subtitle="Histórico de saldo nos últimos 3 meses">
          <TotalEvolution data={total} />
        </Panel></MobileTab>
        <MobileTab k="evolucao"><Panel icon={<Scale className="h-5 w-5" />} tone="bg-violet-500/15 text-violet-400" title="Créditos vs Débitos" subtitle="Entradas e saídas de pontos nos últimos 3 meses">
          <CreditsDebits data={o.months} />
        </Panel></MobileTab>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <MobileTab k="recentes"><Panel icon={<ScrollText className="h-5 w-5" />} tone="bg-blue-500/15 text-blue-400" title="Lançamentos Recentes" subtitle="Últimas movimentações nas suas contas" link={{ href: "/app/entries", label: "Ver todos" }}>
          {o.recent.length === 0 ? <p className="rounded-xl bg-panel2 px-4 py-8 text-center text-sm text-muted">Nenhum lançamento ainda.</p> : (
            <ul className="space-y-2">
              {o.recent.map((e) => {
                const cost = Math.abs(e.costCents);
                return (
                  <li key={e.id} className="flex items-center gap-3 rounded-xl bg-panel2/60 px-4 py-3">
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: e.account.program.color }} aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{e.description}</p>
                      <p className="truncate text-xs text-muted">
                        <span className="font-medium text-zinc-300">{e.account.program.name} {e.account.holder.name}</span> · {dayMonth(e.occurredAt)} · {CATEGORY[e.type] ?? ENTRY_LABELS[e.type]}
                        {e.status === "PENDING" && <span className="text-amber-300"> · a receber</span>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={`text-sm font-semibold tabular-nums ${e.points > 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(e.points)}</p>
                      <p className="text-xs tabular-nums text-muted">{cost > 0 ? money(cost) : e.points > 0 ? "Orgânico" : "—"}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel></MobileTab>
        <MobileTab k="geral"><Panel icon={<ShoppingBag className="h-5 w-5" />} tone="bg-orange-500/15 text-orange-400" title="Compras Pendentes" subtitle="Compras aguardando entrega ou pontos" link={{ href: "/app/purchases?tab=compras", label: "Gerenciar" }}>
          {pending.purchases.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl bg-panel2/60 px-4 py-10 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel text-muted"><ShoppingBag className="h-5 w-5" /></span>
              <p className="max-w-xs text-sm text-muted">Cadastre compras pendentes para rastrear o recebimento dos pontos.</p>
              <Link href="/app/purchases?tab=compras" className="btn-ghost h-9">Cadastrar compra</Link>
            </div>
          ) : (
            <ul className="space-y-2">
              {pending.purchases.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center gap-3 rounded-xl bg-panel2/60 px-4 py-3">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: p.account.program.color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.storeName}</p>
                    <p className="truncate text-xs text-muted">{p.account.program.name} {p.account.holder.name} · comprado em {dayMonth(p.purchasedAt)}{p.expectedAt && ` · previsto ${dayMonth(p.expectedAt)}`}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold tabular-nums text-amber-300">+{fmtPts(p.expectedPoints)}</p>
                    <p className="text-xs tabular-nums text-muted">{money(p.amountCents)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel></MobileTab>
      </div>
    </MobileTabs>
  );
}

async function SalesView({ userId, money }: { userId: string; money: Money }) {
  const d = await salesDashboard(userId);
  if (d.totals.count === 0) {
    return (
      <Empty title="Nenhuma venda ainda" icon={<HandCoins className="h-5 w-5" />}>
        <p className="max-w-sm text-sm text-muted">Quando você registrar vendas, este painel mostra faturamento, lucro e milhas vendidas.</p>
        <Link className="btn-primary" href="/app/sales">Registrar venda</Link>
      </Empty>
    );
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Faturamento" value={money(d.totals.revenueCents)} hint={`${d.totals.count} ${d.totals.count === 1 ? "venda" : "vendas"}`} />
        <Stat label="Lucro" value={money(d.totals.profitCents)} hint={d.totals.marginPct != null ? `margem de ${d.totals.marginPct.toLocaleString("pt-BR")}%` : undefined} accent />
        <Stat label="Milhas vendidas" value={fmtPts(d.totals.points)} />
        <Stat label="Preço médio" value={money(d.totals.avgPriceCpmCents)} hint="por milheiro" />
      </div>
      <section className="card card-pad mt-4">
        <h2 className="text-lg font-semibold">Faturamento e lucro por mês</h2>
        <p className="mb-4 text-sm text-muted">Últimos 12 meses</p>
        <MonthlySales data={d.monthly.map((m) => ({ month: m.month, revenue: m.revenue, profit: m.profit }))} />
      </section>
      <div className="mt-4 grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        <section className="card overflow-hidden">
          <h2 className="border-b border-line px-5 py-4 text-lg font-semibold">Principais clientes</h2>
          <ul className="divide-y divide-line">
            {d.topCustomers.map((c) => (
              <li key={c.name} className="flex items-center gap-3 px-5 py-3 text-sm">
                <span className="flex-1 truncate font-medium">{c.name}</span>
                <span className="text-muted">{c.count} {c.count === 1 ? "venda" : "vendas"}</span>
                <span className="w-28 text-right font-semibold tabular-nums">{money(c.revenue)}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card card-pad">
          <h2 className="text-lg font-semibold">Milhas vendidas por programa</h2>
          <p className="mb-4 text-sm text-muted">Total desde o início</p>
          <HBar data={d.byProgram} />
        </section>
      </div>
    </>
  );
}
