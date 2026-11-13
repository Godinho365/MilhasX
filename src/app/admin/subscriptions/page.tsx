import Link from "next/link";
import { BadgeDollarSign, CircleSlash, Clock, Hourglass, PlayCircle } from "lucide-react";
import { subscriptionsOverview, SUB_STATUSES } from "@/server/services/admin-billing";
import { parsePeriod } from "@/domain/admin-metrics";
import { PLANS, planPriceCents, type PlanCode, type PlanInterval } from "@/domain/plans";
import { PageHeader } from "@/components/stat";
import { fmtBRL, fmtDay, fmtPts } from "@/lib/format";
import { Chips, Kpi, Pill, Section, TableCard } from "../dashboard-ui";
import { RequestActions } from "./client";

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "zinc" }> = {
  AUTHORIZED: { label: "Ativa", tone: "green" }, PENDING: { label: "Aguardando pagamento", tone: "amber" }, PAUSED: { label: "Pausada", tone: "red" }, CANCELLED: { label: "Cancelada", tone: "zinc" },
};
const planName = (p: string, i: string | null) => `${PLANS[p as PlanCode].name}${p === "PESSOAL" ? "" : i === "ANUAL" ? " anual" : " mensal"}`;

export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ p?: string; s?: string }> }) {
  const sp = await searchParams;
  const period = parsePeriod(sp.p);
  const d = await subscriptionsOverview(period, sp.s ?? null);
  const href = (s: string | null) => `/admin/subscriptions?${new URLSearchParams({ ...(sp.p ? { p: sp.p } : {}), ...(s ? { s } : {}) })}`;
  const total = Object.values(d.counts).reduce((a, b) => a + b, 0);

  return (
    <>
      <PageHeader title="Assinaturas" subtitle={`Mercado Pago, planos ativados pela administração e pedidos de plano · últimos ${d.window.label}`}>
        <a className="btn-ghost h-9 bg-panel" href="/api/admin/export?kind=subscriptions">Exportar CSV</a>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi tone="hl" icon={<BadgeDollarSign className="h-4 w-4" />} label="MRR no Mercado Pago" value={fmtBRL(d.mrrCents)} hint={`${d.counts.AUTHORIZED} assinaturas ativas`} />
        <Kpi icon={<PlayCircle className="h-4 w-4" />} label="Checkouts iniciados" value={fmtPts(d.started)} hint="No período" />
        <Kpi icon={<BadgeDollarSign className="h-4 w-4" />} label="Pagamentos confirmados" value={fmtPts(d.activated)} hint="Viraram ativas no período" />
        <Kpi icon={<CircleSlash className="h-4 w-4" />} label="Canceladas ou pausadas" value={fmtPts(d.ended)} hint="No período" />
        <Kpi tone={d.abandoned ? "warn" : undefined} icon={<Hourglass className="h-4 w-4" />} label="Checkout abandonado" value={fmtPts(d.abandoned)} hint="Aguardando há mais de 1 dia" href="/admin/recovery?t=checkout" />
      </div>

      <section id="pedidos">
        <Section title="Pedidos de plano" subtitle="Quem pediu para mudar de plano sem pagar online. Aprovar ativa o plano sem cobrança.">
          <TableCard colSpan={5} empty={d.requests.length === 0 && "Nenhum pedido esperando."} head={<><th>Usuário</th><th>Plano atual</th><th>Pediu</th><th>Desde</th><th className="text-right"><span className="sr-only">Ações</span></th></>}>
            {d.requests.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">{u.name}</Link><span className="block text-xs text-muted">{u.email}</span></td>
                <td>{PLANS[u.plan].name}{u.trialEndsAt && u.trialEndsAt > new Date() ? <span className="ml-1 text-xs text-amber-300">(em teste)</span> : null}</td>
                <td><Pill tone="blue">{planName(u.planRequest!, u.planRequestInterval)}</Pill></td>
                <td className="text-muted">{u.planRequestedAt ? fmtDay(u.planRequestedAt) : "—"}</td>
                <td className="text-right"><RequestActions userId={u.id} name={u.name} plan={u.planRequest!} interval={u.planRequestInterval} /></td>
              </tr>
            ))}
          </TableCard>
        </Section>
      </section>

      <Section title="Mercado Pago" subtitle="Assinaturas criadas no checkout, das mais recentes para as mais antigas">
        <Chips active={d.status ?? "all"} items={[{ key: "all", label: "Todas", href: href(null), n: total }, ...SUB_STATUSES.map((s) => ({ key: s, label: STATUS[s]!.label, href: href(s), n: d.counts[s] }))]} />
        <TableCard colSpan={6} empty={d.list.length === 0 && "Nenhuma assinatura aqui."} head={<><th>Usuário</th><th>Plano</th><th className="text-right">Valor</th><th>Status</th><th>Criada</th><th>Atualizada</th></>}>
          {d.list.map((s) => (
            <tr key={s.id}>
              <td><Link href={`/admin/users/${s.user.id}`} className="font-semibold hover:underline">{s.user.name}</Link><span className="block text-xs text-muted">{s.user.email}</span></td>
              <td>{planName(s.plan, s.interval)}</td>
              <td className="text-right tabular-nums">{fmtBRL(s.amountCents)}{s.interval === "ANUAL" && <span className="block text-xs text-muted">{fmtBRL(Math.round(s.amountCents / 12))}/mês</span>}</td>
              <td><Pill tone={STATUS[s.status]?.tone ?? "zinc"}>{STATUS[s.status]?.label ?? s.status}</Pill></td>
              <td className="text-muted">{fmtDay(s.createdAt)}</td>
              <td className="text-muted">{fmtDay(s.updatedAt)}</td>
            </tr>
          ))}
        </TableCard>
      </Section>

      <Section title="Ativados pela administração" subtitle="Planos pagos sem assinatura ativa no Mercado Pago (cortesias e ativações manuais)">
        <TableCard colSpan={3} empty={d.manual.length === 0 && "Nenhum plano ativado à mão."} head={<><th>Usuário</th><th>Plano</th><th className="text-right">Preço de tabela</th></>}>
          {d.manual.map((u) => (
            <tr key={u.id}>
              <td><Link href={`/admin/users/${u.id}`} className="font-semibold hover:underline">{u.name}</Link><span className="block text-xs text-muted">{u.email}</span></td>
              <td>{planName(u.plan, u.planInterval)}</td>
              <td className="text-right tabular-nums text-muted"><Clock className="mr-1 inline h-3.5 w-3.5" />{fmtBRL(planPriceCents(u.plan, (u.planInterval ?? "MENSAL") as PlanInterval))}/mês</td>
            </tr>
          ))}
        </TableCard>
      </Section>
    </>
  );
}
