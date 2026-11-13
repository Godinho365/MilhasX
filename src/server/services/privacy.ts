import { createHash } from "node:crypto";
import { prisma, DomainError, log } from "../db";
import { contactEmail } from "../contact";
import { sendEmail } from "../mailer";
import { plainEmail } from "../emails/templates";
import { newestConsent, sameConsent, storedConsent, type Consent } from "@/domain/consent";
import { PRIVACY_REQUEST_KINDS, type PrivacyRequestKind } from "@/domain/privacy";

// ---------- Escolha de cookies na conta (para valer em todos os aparelhos) ----------

/** A escolha guardada na conta de quem entrou (a pessoa, não a agência: cada membro tem a sua). */
export async function accountConsent(personId: string): Promise<Consent | null> {
  const p = await prisma.userPreference.findUnique({ where: { userId: personId }, select: { cookieConsent: true } });
  return storedConsent(p?.cookieConsent);
}

export async function saveAccountConsent(personId: string, c: Consent) {
  const data = { cookieConsent: { version: c.version, analytics: c.analytics, marketing: c.marketing, decidedAt: c.decidedAt } };
  await prisma.userPreference.upsert({ where: { userId: personId }, update: data, create: { userId: personId, ...data } });
}

/**
 * Junta a escolha do navegador com a da conta: vale a mais recente. Guarda na conta se a do navegador é mais nova.
 * Devolve a escolha que vale e se o cookie do navegador precisa ser regravado.
 */
export async function syncConsent(personId: string | null, browser: Consent | null) {
  if (!personId) return { consent: browser, writeCookie: false };
  const account = await accountConsent(personId);
  const consent = newestConsent(browser, account);
  if (consent && !sameConsent(consent, account)) await saveAccountConsent(personId, consent);
  return { consent, writeCookie: !!consent && !sameConsent(consent, browser) };
}

// ---------- Pedidos de titulares (LGPD, art. 18) ----------

const PER_HOUR = 5;

/**
 * Registra o pedido e avisa o e-mail de contato (CONTACT_EMAIL), se configurado. O IP não é guardado (só um hash
 * para limitar envios) e o log não leva nome, e-mail nem mensagem.
 */
export async function createPrivacyRequest(input: { name: string; email: string; kind: PrivacyRequestKind; message?: string | null }, ip: string) {
  const ipHash = createHash("sha256").update(`privacy:${ip}`).digest("hex").slice(0, 32);
  const recent = await prisma.privacyRequest.count({ where: { ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } });
  if (recent >= PER_HOUR) throw new DomainError(429, "Muitos pedidos enviados. Tente de novo mais tarde.");
  const r = await prisma.privacyRequest.create({
    data: { name: input.name.trim(), email: input.email.trim().toLowerCase(), kind: input.kind, message: input.message?.trim() || null, ipHash },
  });
  const protocol = protocolOf(r.id);
  log("info", "privacy.request_created", { protocol, kind: r.kind });
  const to = contactEmail();
  if (to) {
    const label = PRIVACY_REQUEST_KINDS.find((k) => k.key === r.kind)?.label ?? r.kind;
    const body = [
      `Um pedido de titular de dados foi registrado (protocolo ${protocol}).`,
      `Tipo: ${label}`,
      `Nome: ${r.name}\nE-mail para resposta: ${r.email}`,
      r.message ? `Mensagem:\n${r.message}` : "Sem mensagem.",
      "Confirme a identidade de quem pediu antes de entregar ou apagar dados.",
    ].join("\n\n");
    await sendEmail(to, plainEmail({ subject: `Pedido de titular de dados ${protocol}`, text: body, reason: "este é o e-mail de contato de privacidade" })).catch(() => false);
  }
  return { protocol };
}

/** Protocolo curto para a pessoa citar (os 8 últimos caracteres do id, em maiúsculas). */
export const protocolOf = (id: string) => id.slice(-8).toUpperCase();
