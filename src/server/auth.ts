import bcrypt from "bcryptjs";
import { signupReferral } from "./services/settings";
import { createHash, randomBytes } from "node:crypto";
import { prisma, DomainError, audit, log } from "./db";

export const SESSION_COOKIE = "mm_session";
const SESSION_DAYS = 30;
const RESET_MINUTES = 60;
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILS_PER_EMAIL = 5;
const MAX_FAILS_PER_IP = 20;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const newToken = () => randomBytes(32).toString("base64url");

export const hashPassword = (pw: string) => bcrypt.hash(pw, 12);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export function validatePassword(pw: string) {
  if (pw.length < 8) throw new DomainError(400, "A senha precisa ter pelo menos 8 caracteres");
  if (pw.length > 128) throw new DomainError(400, "Senha longa demais");
}

export async function registerUser(input: { name: string; email: string; password: string; ref?: string }) {
  validatePassword(input.password);
  const email = input.email.trim().toLowerCase();
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) throw new DomainError(409, "E-mail já cadastrado");
  // Papel é sempre USER no cadastro público; ADMIN só pelo script de inicialização.
  const user = await prisma.user.create({
    data: {
      name: input.name.trim(),
      email,
      passwordHash: await hashPassword(input.password),
      role: "USER",
      ...(await signupReferral(input.ref)),
      preference: { create: {} },
    },
  });
  await audit(prisma, user.id, "user.register", "User", user.id);
  return user;
}

export async function createSession(userId: string) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await prisma.session.create({ data: { id: sha256(token), userId, expiresAt } });
  return { token, expiresAt };
}

export async function getUserByToken(token: string | undefined | null) {
  if (!token) return null;
  // A foto (bytes) fica de fora: ela só é lida pela rota /api/me/avatar
  const session = await prisma.session.findUnique({ where: { id: sha256(token) }, include: { user: { omit: { avatar: true } } } });
  if (!session || session.expiresAt < new Date() || session.user.status !== "ACTIVE") return null;
  return session.user;
}

export async function destroySession(token: string | undefined | null) {
  if (!token) return;
  await prisma.session.deleteMany({ where: { id: sha256(token) } });
}

let dummyHash: string | undefined;

export async function login(email: string, password: string, ip: string) {
  email = email.trim().toLowerCase();
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    prisma.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    prisma.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  if (byEmail >= MAX_FAILS_PER_EMAIL || byIp >= MAX_FAILS_PER_IP) {
    log("warn", "login.rate_limited", { ip });
    throw new DomainError(429, "Muitas tentativas. Aguarde alguns minutos e tente novamente.");
  }
  const user = await prisma.user.findUnique({ where: { email } });
  // Compara mesmo sem usuário para não revelar quais e-mails existem pelo tempo de resposta
  dummyHash ??= await hashPassword(newToken());
  const ok = await verifyPassword(password, user?.passwordHash ?? dummyHash);
  if (!user || !ok || user.status !== "ACTIVE") {
    await prisma.loginAttempt.create({ data: { email, ip, success: false } });
    throw new DomainError(401, user && ok ? "Conta desativada" : "E-mail ou senha inválidos");
  }
  await prisma.loginAttempt.create({ data: { email, ip, success: true } });
  return { user, ...(await createSession(user.id)) };
}

/** Sempre "sucesso" para o chamador; retorna o token só para o canal de entrega (e-mail/log dev). */
export async function requestPasswordReset(email: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user || user.status !== "ACTIVE") return null;
  const token = newToken();
  await prisma.passwordResetToken.create({
    data: { tokenHash: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000) },
  });
  await audit(prisma, user.id, "user.password_reset_requested", "User", user.id);
  return token;
}

export async function resetPassword(token: string, newPassword: string) {
  validatePassword(newPassword);
  const rec = await prisma.passwordResetToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw new DomainError(400, "Link inválido ou expirado");
  await prisma.$transaction(async (tx) => {
    // updateMany com usedAt null evita uso duplo concorrente do mesmo token
    const used = await tx.passwordResetToken.updateMany({
      where: { id: rec.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (used.count !== 1) throw new DomainError(400, "Link inválido ou expirado");
    await tx.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(newPassword) } });
    await tx.session.deleteMany({ where: { userId: rec.userId } });
    await audit(tx, rec.userId, "user.password_reset", "User", rec.userId);
  });
}

export async function changePassword(userId: string, current: string, next: string) {
  validatePassword(next);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  if (!(await verifyPassword(current, user.passwordHash))) throw new DomainError(400, "Senha atual incorreta");
  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
  await audit(prisma, userId, "user.password_changed", "User", userId);
}
