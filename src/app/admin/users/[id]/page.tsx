import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageAdmin } from "@/server/session";
import { userDetail } from "@/server/services/admin";
import { effectivePlan, PLANS } from "@/domain/plans";
import { contactText, emailSentState, isEmailReason, mailLink, waLink, waPhone } from "@/domain/admin-contact";
import { lastAdminEmails } from "@/server/services/admin-email";
import { fmtBRL, fmtDateTime, fmtDay, fmtPts } from "@/lib/format";
import { Panel, Pill } from "../../dashboard-ui";
import { ContactButtons, UserActions } from "./actions";

const SUB_STATUS: Record<string, { label: string; tone: "green" | "amber" | "red" | "zinc" }> = {
  AUTHORIZED: { label: "Ativa", tone: "green" }, PENDING: { label: "Aguardando pagamento", tone: "amber" }, PAUSED: { label: "Pausada", tone: "red" }, CANCELLED: { label: "Cancelada", tone: "zinc" },
};

function Kv({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="divide-y divide-line text-sm">
      {rows.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v}</dd></div>)}
    </dl>
  );
}

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requirePageAdmin();
  const u = await userDetail((await params).id);
  if (!u) notFound();
  const eff = effectivePlan(u);
  const reason = u.planRequest ? "request" : eff.trialDaysLeft ? "trial" : u.subscriptions.some((s) => s.status === "PENDING") ? "checkout" : "generic";
  const text = contactText(reason, u.name, { plan: u.planRequest ? PLANS[u.planRequest].name : undefined, days: eff.trialDaysLeft });
  const ini = u.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const phone = waPhone(u.phone);
  // "Enviar e-mail" pelo MilhasX só para conta ativa de cliente, sem pedido de exclusão, e com mensagem pronta
  const canEmail = isEmailReason(reason) && u.role === "USER" && u.status === "ACTIVE" && !u.deletionRequestedAt;
  const emailSentAt = canEmail ? (await lastAdminEmails([u.id])).get(u.id) : null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-[rgb(var(--brand))] text-lg font-extrabold text-[rgb(var(--gold))]">{ini}</span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{u.name}</h1>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-sm text-muted">
            {u.email}{phone && <> · +{phone}</>}
            <span className="mx-1">·</span>
            {u.status === "ACTIVE" ? <Pill tone="green">Ativo</Pill> : <Pill tone="red">Desativado</Pill>}
            {u.role === "ADMIN" && <Pill tone="amber">Admin</Pill>}
            {u.workspaceOwnerId && <Pill tone="blue">Membro de equipe</Pill>}
            {u.deletionRequestedAt && <Pill tone="red">Pediu exclusão em {fmtDay(u.deletionRequestedAt)}</Pill>}
          </p>
        </div>
        <ContactButtons userId={u.id} wa={waLink(u.phone, text)} mail={mailLink(u.email, "MilhasX", text)} reason={reason} send={canEmail ? { sent: emailSentState(emailSentAt) } : null} />
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {([
          ["Plano em uso", eff.trialDaysLeft ? `Gestor (teste)` : PLANS[u.plan].name, eff.trialDaysLeft ? `${eff.trialDaysLeft} dias de teste` : u.planInterval === "ANUAL" ? "Anual" : u.plan === "PESSOAL" ? "Grátis" : "Mensal"],
          ["Último uso", u.lastActivity ? fmtDay(u.lastActivity) : "Nunca", u.lastLogin ? `Último login ${fmtDateTime(u.lastLogin)}` : "Sem login registrado"],
          ["Lançamentos", fmtPts(u._count.entries), `${u._count.accounts} contas · ${u._count.holders} titulares`],
          ["Vendas", fmtPts(u._count.sales), `${u._count.customers} clientes`],
        ] as const).map(([l, v, h]) => (
          <div key={l} className="card px-[18px] py-4"><p className="text-[13px] font-medium text-muted">{l}</p><p className="mt-2 text-xl font-bold tracking-tight">{v}</p><p className="text-xs text-muted">{h}</p></div>
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <Panel title="Plano e assinatura">
            <Kv rows={[
              ["Plano contratado", `${PLANS[u.plan].name}${u.planInterval ? ` · ${u.planInterval === "ANUAL" ? "anual" : "mensal"}` : ""}`],
              ["Teste grátis", u.trialEndsAt ? (eff.trialDaysLeft ? `até ${fmtDay(u.trialEndsAt)} (${eff.trialDaysLeft} dias)` : `acabou em ${fmtDay(u.trialEndsAt)}`) : "Não usou"],
              ["Pedido de plano", u.planRequest ? <Pill tone="blue">{PLANS[u.planRequest].name}{u.planRequestInterval === "ANUAL" ? " anual" : ""}{u.planRequestedAt ? ` · ${fmtDay(u.planRequestedAt)}` : ""}</Pill> : "—"],
            ]} />
            {u.subscriptions.length > 0 && (
              <div className="-mx-5 mt-4 overflow-x-auto border-t border-line sm:-mx-6">
                <table className="table-base">
                  <thead><tr><th>Mercado Pago</th><th>Status</th><th className="text-right">Valor</th><th>Criada</th><th>Atualizada</th></tr></thead>
                  <tbody>
                    {u.subscriptions.map((s) => (
                      <tr key={s.id}>
                        <td>{PLANS[s.plan].name} {s.interval === "ANUAL" ? "anual" : "mensal"}</td>
                        <td><Pill tone={SUB_STATUS[s.status]?.tone ?? "zinc"}>{SUB_STATUS[s.status]?.label ?? s.status}</Pill></td>
                        <td className="text-right tabular-nums">{fmtBRL(s.amountCents)}</td>
                        <td className="text-muted">{fmtDay(s.createdAt)}</td>
                        <td className="text-muted">{fmtDay(s.updatedAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
          <Panel title="Histórico" subtitle="Ações do usuário e da administração sobre esta conta">
            {u.history.length === 0 ? <p className="py-4 text-center text-sm text-muted">Nada registrado.</p> : (
              <ul className="-mx-2 divide-y divide-line">
                {u.history.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-2 py-2 text-sm">
                    <code className="min-w-0 flex-1 truncate text-xs">{a.action}</code>
                    <span className="hidden max-w-[35%] truncate text-xs text-muted sm:inline">{a.actorId === u.id ? "o próprio usuário" : a.actor?.name ?? "sistema"}</span>
                    <span className="shrink-0 text-xs tabular-nums text-muted">{fmtDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
        <div className="space-y-3">
          <UserActions self={u.id === admin.id} u={{ id: u.id, email: u.email, status: u.status, plan: u.plan, planInterval: u.planInterval, planRequest: u.planRequest, planRequestInterval: u.planRequestInterval }} />
          <Panel title="Dados">
            <Kv rows={[
              ["Cliente desde", fmtDay(u.createdAt)],
              ["Login com Google", u.googleId ? "Sim" : "Não"],
              ["Aceite dos termos", u.termsAcceptedAt ? fmtDay(u.termsAcceptedAt) : "—"],
              ["Indicado por", u.referredBy ? <Link className="text-[rgb(var(--brand))] hover:underline" href={`/admin/users/${u.referredBy.id}`}>{u.referredBy.name}</Link> : "—"],
              ["Indicações feitas", fmtPts(u._count.referrals)],
              ["Sessões abertas", fmtPts(u._count.sessions)],
            ]} />
          </Panel>
        </div>
      </div>
    </>
  );
}
