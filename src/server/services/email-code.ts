import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma, DomainError, log } from "../db";
import { sendMail, smtpConfig } from "../mailer";

/**
 * Código de 6 dígitos para confirmar o e-mail antes de criar a conta. A conta só nasce depois do
 * código certo: não ficam contas "pela metade" com e-mails que não existem.
 */
export const CODE_MINUTES = 10;
export const MAX_ATTEMPTS = 5;
export const RESEND_SECONDS = 60;
const MAX_PER_EMAIL_HOUR = 5;
const MAX_PER_IP_HOUR = 15;
const PURPOSE = "signup";

/** Só exige o código quando o app consegue mandar e-mail de verdade (SMTP configurado). */
export const signupCodeRequired = () => !!smtpConfig();

const normalize = (email: string) => email.trim().toLowerCase();
const hashCode = (email: string, code: string) => createHash("sha256").update(`${PURPOSE}:${normalize(email)}:${code}`).digest("hex");

/** Gera e grava um código novo (invalida os anteriores ainda não usados). Devolve o código para o envio. */
export async function createSignupCode(emailRaw: string, ip: string) {
  const email = normalize(emailRaw);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new DomainError(409, "E-mail já cadastrado");

  const now = Date.now();
  const last = await prisma.emailCode.findFirst({ where: { email, purpose: PURPOSE }, orderBy: { createdAt: "desc" }, select: { createdAt: true } });
  if (last) {
    const wait = Math.ceil((last.createdAt.getTime() + RESEND_SECONDS * 1000 - now) / 1000);
    if (wait > 0) throw new DomainError(429, `Aguarde ${wait}s para pedir outro código`);
  }
  const hourAgo = new Date(now - 3600_000);
  const [byEmail, byIp] = await Promise.all([
    prisma.emailCode.count({ where: { email, purpose: PURPOSE, createdAt: { gte: hourAgo } } }),
    prisma.emailCode.count({ where: { ip, createdAt: { gte: hourAgo } } }),
  ]);
  if (byEmail >= MAX_PER_EMAIL_HOUR || byIp >= MAX_PER_IP_HOUR) {
    log("warn", "email_code.rate_limited", { ip });
    throw new DomainError(429, "Muitos códigos pedidos. Tente de novo mais tarde.");
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction([
    prisma.emailCode.deleteMany({ where: { email, purpose: PURPOSE, usedAt: null } }),
    prisma.emailCode.create({ data: { email, purpose: PURPOSE, codeHash: hashCode(email, code), ip, expiresAt: new Date(now + CODE_MINUTES * 60_000) } }),
  ]);
  return code;
}

/** Gera o código e manda por e-mail. */
export async function requestSignupCode(email: string, ip: string, appName: string) {
  const code = await createSignupCode(email, ip);
  const sent = await sendMail(
    normalize(email),
    `${code} é o seu código de verificação do ${appName}`,
    `Seu código para confirmar o e-mail e criar a conta no ${appName} é:\n\n${code}\n\nEle vale por ${CODE_MINUTES} minutos. Se você não pediu este código, pode ignorar este e-mail.`,
  );
  if (!sent) throw new DomainError(503, "Não foi possível enviar o e-mail agora. Tente de novo em instantes.");
}

/** Confere o código e o consome (uso único). Lança erro com a mensagem para a tela. */
export async function consumeSignupCode(emailRaw: string, codeRaw: string | undefined | null) {
  const email = normalize(emailRaw);
  const code = (codeRaw ?? "").replace(/\D/g, "");
  if (code.length !== 6) throw new DomainError(400, "Digite o código de 6 dígitos enviado para o seu e-mail");
  const rec = await prisma.emailCode.findFirst({ where: { email, purpose: PURPOSE, usedAt: null }, orderBy: { createdAt: "desc" } });
  if (!rec || rec.expiresAt < new Date()) throw new DomainError(400, "Código expirado. Peça um novo código.");
  if (rec.attempts >= MAX_ATTEMPTS) throw new DomainError(400, "Muitas tentativas erradas. Peça um novo código.");

  const ok = timingSafeEqual(Buffer.from(rec.codeHash, "hex"), Buffer.from(hashCode(email, code), "hex"));
  if (!ok) {
    const { attempts } = await prisma.emailCode.update({ where: { id: rec.id }, data: { attempts: { increment: 1 } }, select: { attempts: true } });
    const left = MAX_ATTEMPTS - attempts;
    throw new DomainError(400, left > 0 ? `Código incorreto. ${left === 1 ? "Resta 1 tentativa" : `Restam ${left} tentativas`}.` : "Muitas tentativas erradas. Peça um novo código.");
  }
  // updateMany com usedAt null: o mesmo código não serve para duas contas ao mesmo tempo
  const used = await prisma.emailCode.updateMany({ where: { id: rec.id, usedAt: null }, data: { usedAt: new Date() } });
  if (used.count !== 1) throw new DomainError(400, "Código já usado. Peça um novo código.");
}
