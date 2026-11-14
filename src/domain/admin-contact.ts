// Contato da administração com o cliente (Recuperação e ficha do usuário): link do WhatsApp e textos prontos.

export type ContactReason = "request" | "checkout" | "trial" | "risk" | "generic";

export const CONTACT_LABELS: Record<ContactReason, string> = {
  request: "Pediu plano e não ativou",
  checkout: "Começou o pagamento e não concluiu",
  trial: "Teste acabando",
  risk: "Sem uso há dias",
  generic: "Contato",
};

/** Só dígitos, com o 55 do Brasil quando vier só DDD + número. Devolve null se não der para usar. */
export function waPhone(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length === 10 || d.length === 11) return `55${d}`;
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
  return null;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || "";

export function contactText(reason: ContactReason, name: string, extra: { plan?: string; days?: number } = {}) {
  const oi = `Oi, ${firstName(name)}! Aqui é da equipe MilhasX.`;
  switch (reason) {
    case "request":
      return `${oi} Vi que você pediu o plano ${extra.plan ?? ""}`.trimEnd() + ". Posso te ajudar a concluir a ativação?";
    case "checkout":
      return `${oi} Vi que você começou a assinatura${extra.plan ? ` do plano ${extra.plan}` : ""} e o pagamento não foi concluído. Ficou alguma dúvida? Posso te ajudar por aqui.`;
    case "trial":
      return `${oi} Seu teste grátis do plano Gestor acaba ${extra.days === 1 ? "amanhã" : extra.days !== undefined && extra.days <= 0 ? "hoje" : `em ${extra.days ?? "poucos"} dias`}. Quer ajuda para escolher o plano ou tirar alguma dúvida?`;
    case "risk":
      return `${oi} Sentimos sua falta por aqui. Está tudo certo com a sua conta? Se precisar de ajuda para organizar suas milhas, é só responder.`;
    default:
      return `${oi} `;
  }
}

export function waLink(phone: string | null | undefined, text: string): string | null {
  const p = waPhone(phone);
  return p ? `https://wa.me/${p}?text=${encodeURIComponent(text)}` : null;
}

export function mailLink(email: string, subject: string, body: string) {
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ---------- E-mail enviado pelo próprio MilhasX (botão "Enviar e-mail" do admin) ----------

/** Um e-mail por pessoa a cada 24 h: dois cliques (ou dois admins) não mandam a mesma mensagem duas vezes. */
export const ADMIN_EMAIL_COOLDOWN_HOURS = 24;
/** O e-mail de recuperação só vale para quem parou o cadastro há até 30 dias (acompanhamento, não campanha). */
export const SIGNUP_RECOVERY_MAX_DAYS = 30;
/** Motivos com mensagem pronta para o e-mail do MilhasX. "generic" não tem texto: fica com WhatsApp e o app de e-mail. */
export const EMAIL_REASONS = ["request", "checkout", "trial", "risk"] as const;
export type EmailReason = (typeof EMAIL_REASONS)[number];
export const isEmailReason = (r: string): r is EmailReason => (EMAIL_REASONS as readonly string[]).includes(r);

const HOUR = 3_600_000;
const dm = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });
const dmhm = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export type EmailSentState = { sentOn: string; blocked: boolean; again: string };

/** Situação do último envio para a tela: "enviado em dd/mm" e se ainda está dentro das 24 h. */
export function emailSentState(lastSentAt: Date | null | undefined, now = new Date()): EmailSentState | null {
  if (!lastSentAt) return null;
  const until = new Date(lastSentAt.getTime() + ADMIN_EMAIL_COOLDOWN_HOURS * HOUR);
  return { sentOn: dm(lastSentAt), blocked: until > now, again: dmhm(until) };
}

/** Mensagem do bloqueio de reenvio (quando ainda não passou o prazo). */
export function resendBlockedMessage(lastSentAt: Date) {
  const until = new Date(lastSentAt.getTime() + ADMIN_EMAIL_COOLDOWN_HOURS * HOUR);
  return `E-mail já enviado em ${dmhm(lastSentAt)}. Dá para mandar de novo a partir de ${dmhm(until)}.`;
}

/** O cadastro parado ainda está no prazo do e-mail de recuperação? */
export const signupRecoveryOpen = (startedAt: Date, now = new Date()) => now.getTime() - startedAt.getTime() <= SIGNUP_RECOVERY_MAX_DAYS * 24 * HOUR;
