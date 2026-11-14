"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Mail, MessageCircle } from "lucide-react";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { toast, confirmDialog } from "@/components/feedback";
import { CONTACT_LABELS, isEmailReason, type EmailSentState } from "@/domain/admin-contact";
import { SendEmailButton } from "../../send-email-button";

type PlanCode = "PESSOAL" | "PRO" | "GESTOR";
const PLAN_NAMES: Record<PlanCode, string> = { PESSOAL: "Pessoal", PRO: "PRO", GESTOR: "Gestor" };

export function UserActions({ u, self }: { self: boolean; u: { id: string; email: string; status: string; plan: PlanCode; planInterval: string | null; planRequest: PlanCode | null; planRequestInterval: string | null } }) {
  const router = useRouter();
  const [plan, setPlan] = useState<PlanCode>(u.planRequest ?? u.plan);
  const [interval, setInterval] = useState(u.planRequestInterval ?? u.planInterval ?? "MENSAL");
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<{ ok: boolean; erro?: string }>, msg: string) {
    setBusy(true);
    const r = await fn();
    setBusy(false);
    if (!r.ok) return toast(r.erro ?? "Não foi possível concluir", "error");
    toast(msg);
    refreshSafe(router);
  }
  const savePlan = () => run(() => api(`/api/admin/users/${u.id}/plan`, "PUT", { plan, interval: plan === "PESSOAL" ? null : interval }), `Plano ${PLAN_NAMES[plan]} ativado`);
  const trial = (days: number) => run(() => api(`/api/admin/users/${u.id}/trial`, "POST", { days }), `Teste estendido em ${days} dias`);
  async function toggle() {
    const next = u.status === "ACTIVE" ? "DISABLED" : "ACTIVE";
    if (next === "DISABLED" && !(await confirmDialog({ title: `Desativar ${u.email}?`, body: "As sessões abertas serão encerradas e o login ficará bloqueado.", confirmLabel: "Desativar", danger: true }))) return;
    run(() => api(`/api/admin/users/${u.id}`, "PATCH", { status: next }), next === "DISABLED" ? "Conta desativada" : "Conta reativada");
  }

  return (
    <section className="card card-pad space-y-5">
      <h3 className="text-sm font-semibold">Ações</h3>
      <div>
        <p className="label">Plano</p>
        <div className="flex flex-wrap gap-2">
          <select className="input h-9 w-32" value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)} aria-label="Plano">
            {(Object.keys(PLAN_NAMES) as PlanCode[]).map((p) => <option key={p} value={p}>{PLAN_NAMES[p]}</option>)}
          </select>
          {plan !== "PESSOAL" && (
            <select className="input h-9 w-28" value={interval} onChange={(e) => setInterval(e.target.value)} aria-label="Cobrança">
              <option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option>
            </select>
          )}
          <button className="btn-primary" disabled={busy} onClick={savePlan}>{u.planRequest ? "Aprovar pedido" : "Ativar plano"}</button>
        </div>
        <p className="mt-1.5 text-xs text-muted">Ativação manual, sem cobrança no Mercado Pago.</p>
      </div>
      <div>
        <p className="label">Teste grátis do Gestor</p>
        <div className="flex flex-wrap gap-2">
          {[7, 15, 30].map((d) => <button key={d} className="btn-ghost" disabled={busy} onClick={() => trial(d)}>+{d} dias</button>)}
        </div>
      </div>
      {!self && (
        <div className="border-t border-line pt-4">
          <button className={u.status === "ACTIVE" ? "btn-ghost text-red-400" : "btn-ghost text-green-400"} disabled={busy} onClick={toggle}>{u.status === "ACTIVE" ? "Desativar conta" : "Reativar conta"}</button>
        </div>
      )}
    </section>
  );
}

/**
 * Botões de WhatsApp e e-mail que também registram o contato na auditoria. Com `send` (motivo com mensagem pronta),
 * aparece também o "Enviar e-mail", que o próprio MilhasX manda; o mailto fica como alternativa.
 */
export function ContactButtons({ userId, wa, mail, reason, compact = false, send = null }: {
  userId: string; wa: string | null; mail: string; reason: string; compact?: boolean;
  send?: { sent: EmailSentState | null } | null;
}) {
  const router = useRouter();
  function log(channel: "whatsapp" | "email") {
    // Não bloqueia a abertura do link: registra em paralelo
    void api(`/api/admin/users/${userId}/contact`, "POST", { channel, reason }).then((r) => r.ok && refreshSafe(router));
  }
  const cls = compact ? "btn-ghost h-8 px-2.5 text-xs" : "btn-ghost";
  return (
    // Na tabela (compact) os botões ficam numa linha: a tabela rola dentro do cartão no celular
    <span className={`inline-flex gap-1.5 ${compact ? "flex-nowrap" : "flex-wrap"}`}>
      {wa ? <a className={`${cls} text-green-400`} href={wa} target="_blank" rel="noreferrer" onClick={() => log("whatsapp")}><MessageCircle className="h-4 w-4" />WhatsApp</a>
        : <span className={`${cls} cursor-not-allowed opacity-50`} title="Sem telefone válido no cadastro"><MessageCircle className="h-4 w-4" />WhatsApp</span>}
      {send && isEmailReason(reason) ? (
        <>
          <SendEmailButton compact={compact} path={`/api/admin/users/${userId}/email`} body={{ reason }} label="Enviar e-mail" sent={send.sent}
            confirm={{ title: "Enviar e-mail pelo MilhasX?", body: `Vai a mensagem pronta de “${CONTACT_LABELS[reason]}”, com o visual do MilhasX e o botão para a conta. Dá para mandar de novo só depois de 24 h.` }} />
          <a className={compact ? "btn-ghost h-8 w-8 px-0 text-xs" : cls} href={mail} onClick={() => log("email")} title="Abrir no seu app de e-mail" aria-label="Abrir no seu app de e-mail"><Mail className="h-4 w-4" />{!compact && "App de e-mail"}</a>
        </>
      ) : <a className={cls} href={mail} onClick={() => log("email")}><Mail className="h-4 w-4" />E-mail</a>}
    </span>
  );
}
