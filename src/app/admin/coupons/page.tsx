import { headers } from "next/headers";
import { brDay } from "@/domain/brasilia";
import { listCoupons } from "@/server/services/promo";
import { couponLabel, inviteState, INVITE_STATE_LABEL } from "@/domain/promo";
import { PageHeader } from "@/components/stat";
import { fmtBRL, fmtDay, fmtPts } from "@/lib/format";
import { Kpi, Pill, TableCard } from "../dashboard-ui";
import { ActiveSwitch, CopyButton, CouponForm } from "./client";

const TONE = { active: "green", paused: "zinc", expired: "red", full: "amber" } as const;

export default async function AdminCoupons() {
  const [coupons, h] = await Promise.all([listCoupons(), headers()]);
  const origin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : `https://${h.get("host")}`;
  const now = new Date();
  const withState = coupons.map((c) => ({ ...c, state: inviteState({ ...c, kind: "", plan: null, interval: null, days: null }, c.uses, now) }));
  return (
    <>
      <PageHeader title="Cupons" subtitle="Descontos na assinatura do Mercado Pago. O desconto vale para todas as cobranças da assinatura.">
        <a className="btn-ghost h-9 bg-panel" href="/api/admin/export?kind=coupons">Exportar CSV</a>
        <CouponForm />
      </PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Cupons ativos" value={fmtPts(withState.filter((c) => c.state === "active").length)} hint={`${coupons.length} no total`} />
        <Kpi label="Assinaturas com cupom" value={fmtPts(coupons.reduce((t, c) => t + c.uses, 0))} hint="Pagas e ativas" />
        <Kpi label="Checkouts com cupom" value={fmtPts(coupons.reduce((t, c) => t + c.started, 0))} hint="Inclui os não pagos" />
        <Kpi label="Desconto concedido" value={fmtBRL(coupons.reduce((t, c) => t + c.discountMonthCents, 0))} hint="Por ciclo, nas assinaturas ativas" />
      </div>
      <TableCard colSpan={7} minW={860} empty={coupons.length === 0 && "Nenhum cupom ainda. Crie o primeiro em \"Novo cupom\"."} head={<><th>Código</th><th>Desconto</th><th>Vale para</th><th>Usos</th><th>Validade</th><th>Situação</th><th className="text-right"><span className="sr-only">Ações</span></th></>}>
        {withState.map((c) => (
          <tr key={c.id}>
            <td><code className="rounded bg-panel2 px-1.5 py-0.5 text-[13px] font-semibold">{c.code}</code>{c.note && <span className="mt-1 block text-xs text-muted">{c.note}</span>}</td>
            <td className="font-medium">{couponLabel(c)}</td>
            <td className="text-muted">{c.plans.length ? c.plans.map((p) => (p === "GESTOR" ? "Gestor" : p)).join(", ") : "Todos os planos"} · {c.intervals.length === 1 ? (c.intervals[0] === "ANUAL" ? "anual" : "mensal") : "mensal e anual"}</td>
            <td className="tabular-nums">{c.uses}{c.maxUses !== null && <span className="text-muted"> / {c.maxUses}</span>}{c.started > c.uses && <span className="block text-xs text-muted">{c.started - c.uses} não pagos</span>}</td>
            <td className="text-muted">{c.expiresAt ? fmtDay(c.expiresAt) : "Sem validade"}</td>
            <td><Pill tone={TONE[c.state]}>{INVITE_STATE_LABEL[c.state]}</Pill></td>
            <td>
              <span className="flex items-center justify-end gap-2">
                <CopyButton text={`${origin}/app/upgrade?cupom=${encodeURIComponent(c.code)}`} label="Link" />
                <CouponForm initial={{ id: c.id, code: c.code, kind: c.kind as "PERCENT" | "FIXED", value: c.value, plans: c.plans, intervals: c.intervals, maxUses: c.maxUses, expiresAt: c.expiresAt ? brDay(c.expiresAt) : null, note: c.note }} />
                <ActiveSwitch url={`/api/admin/coupons/${c.id}`} active={c.active} name={`Cupom ${c.code}`} />
              </span>
            </td>
          </tr>
        ))}
      </TableCard>
    </>
  );
}
