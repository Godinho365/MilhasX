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
