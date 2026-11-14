// E-mails que o próprio MilhasX manda a pedido da administração (Leads, Recuperação e ficha do usuário), no lugar
// do mailto. Cada envio vira um "admin.contact" na Auditoria (com sent: true) e a mesma pessoa só recebe outro
// depois de 24 h. O e-mail do lead sem conta nunca vai para URL, log ou Auditoria: lá fica só um hash dele.
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, audit, DomainError } from "../db";
import { sendEmail } from "../mailer";
import { brandFromEnv, type EmailContent } from "../emails/layout";
import { accountFollowUpEmail, signupRecoveryEmail } from "../emails/templates";
import { PLANS, type PlanCode } from "@/domain/plans";
import {
  ADMIN_EMAIL_COOLDOWN_HOURS, SIGNUP_RECOVERY_MAX_DAYS, resendBlockedMessage, signupRecoveryOpen, type EmailReason,
} from "@/domain/admin-contact";

export const CONTACT_ACTION = "admin.contact";
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Utm do link do e-mail de recuperação: a conta que voltar por ele aparece em Leads com essa origem. */
const RECOVERY_UTM = "utm_source=email&utm_medium=admin&utm_campaign=recuperar-cadastro";

/** Como o lead sem conta aparece na Auditoria: hash do e-mail (o e-mail em si não fica registrado). */
export const leadRef = (email: string) => createHash("sha256").update(`milhasx:lead:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);

const sentOnly = { path: ["sent"], equals: true } satisfies Prisma.JsonNullableFilter<"AuditLog">;

/** Último e-mail enviado pelo MilhasX para cada alvo (id do usuário ou leadRef). */
export async function lastAdminEmails(targetIds: string[]): Promise<Map<string, Date>> {
  const ids = [...new Set(targetIds)];
  if (!ids.length) return new Map();
  const rows = await prisma.auditLog.groupBy({
    by: ["targetId"],
    where: { action: CONTACT_ACTION, targetId: { in: ids }, meta: sentOnly },
    _max: { createdAt: true },
  });
  return new Map(rows.filter((r) => r.targetId && r._max.createdAt).map((r) => [r.targetId!, r._max.createdAt!]));
}

/**
 * Envia uma vez por janela de 24 h. A trava (por alvo) faz o segundo clique esperar o primeiro e então ver o
 * registro dele; o registro só é gravado se o e-mail saiu (se o envio falhar, nada fica e dá para tentar de novo).
 */
async function sendOnce(o: { actorId: string; targetType: "User" | "Lead"; targetId: string; reason: string; to: string; content: EmailContent; now: Date }) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`admin-email:${o.targetId}`}))`;
      const last = await tx.auditLog.findFirst({
        where: { action: CONTACT_ACTION, targetId: o.targetId, meta: sentOnly, createdAt: { gt: new Date(o.now.getTime() - ADMIN_EMAIL_COOLDOWN_HOURS * HOUR) } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (last) throw new DomainError(429, resendBlockedMessage(last.createdAt));
      if (!(await sendEmail(o.to, o.content))) throw new DomainError(503, "Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
      await audit(tx, o.actorId, CONTACT_ACTION, o.targetType, o.targetId, { channel: "email", reason: o.reason, sent: true });
      return { sentAt: o.now };
    },
    // O envio pelo SMTP pode levar alguns segundos (os limites do mailer somam até ~1 min)
    { timeout: 90_000, maxWait: 10_000 },
  );
}

function appUrlOrFail() {
  const b = brandFromEnv();
  if (!b.appUrl) throw new DomainError(503, "Configure o APP_URL para enviar e-mails com link");
  return b;
}

/** Leads › "Sem conta": e-mail com o link para concluir o cadastro. `codeId` é o código de cadastro do lead. */
export async function sendSignupRecovery(actorId: string, codeId: string, now = new Date()) {
  const code = await prisma.emailCode.findFirst({ where: { id: codeId, purpose: "signup" }, select: { email: true, createdAt: true } });
  if (!code) throw new DomainError(404, "Cadastro não encontrado. Atualize a página.");
  if (await prisma.user.findUnique({ where: { email: code.email }, select: { id: true } })) throw new DomainError(409, "Essa pessoa já concluiu o cadastro");
  if (!signupRecoveryOpen(code.createdAt, now)) throw new DomainError(409, `O cadastro parou há mais de ${SIGNUP_RECOVERY_MAX_DAYS} dias: o e-mail de recuperação não vale mais`);
  const b = appUrlOrFail();
  const content = signupRecoveryEmail({ appName: b.appName, link: `${b.appUrl}/register?${RECOVERY_UTM}` });
  return sendOnce({ actorId, targetType: "Lead", targetId: leadRef(code.email), reason: "signup", to: code.email, content, now });
}

/** Recuperação, Leads e ficha do usuário: a mensagem pronta do motivo, com os dados atuais da conta. */
export async function sendAccountFollowUp(actorId: string, userId: string, reason: EmailReason, now = new Date()) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true, email: true, role: true, status: true, deletionRequestedAt: true, planRequest: true, trialEndsAt: true,
      subscriptions: { where: { status: { not: "AUTHORIZED" } }, orderBy: { createdAt: "desc" }, take: 1, select: { plan: true } },
    },
  });
  if (!u || u.role !== "USER") throw new DomainError(404, "Usuário não encontrado");
  if (u.status !== "ACTIVE") throw new DomainError(409, "A conta está desativada");
  if (u.deletionRequestedAt) throw new DomainError(409, "Essa pessoa pediu a exclusão da conta: não mande mensagens");
  const b = appUrlOrFail();
  const planName = (p: string | null | undefined) => (p && p in PLANS ? PLANS[p as PlanCode].name : null);
  const plan = reason === "request" ? planName(u.planRequest) : reason === "checkout" ? planName(u.subscriptions[0]?.plan) : null;
  const days = reason === "trial" && u.trialEndsAt ? Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / DAY) : null;
  const content = accountFollowUpEmail({ ...b, name: u.name, reason, plan, days });
  return sendOnce({ actorId, targetType: "User", targetId: userId, reason, to: u.email, content, now });
}
