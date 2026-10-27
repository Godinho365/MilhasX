import { prisma, audit } from "../src/server/db";
import { hashPassword, validatePassword } from "../src/server/auth";

/**
 * Cria o administrador (ou promove um usuário existente). Só é chamado pelo script do operador,
 * nunca por uma rota HTTP.
 */
export async function createAdmin(input: { email: string; name: string; password?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+$/.test(email)) throw new Error("E-mail inválido");
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const user = await prisma.user.update({ where: { id: existing.id }, data: { role: "ADMIN", status: "ACTIVE" } });
    await audit(prisma, null, "bootstrap.admin_promoted", "User", user.id);
    return { user, created: false };
  }
  if (!input.password) throw new Error("Senha obrigatória para criar um novo administrador");
  validatePassword(input.password);
  const user = await prisma.user.create({
    data: {
      email,
      name: input.name.trim() || "Administrador",
      passwordHash: await hashPassword(input.password),
      role: "ADMIN",
      preference: { create: {} },
    },
  });
  await audit(prisma, null, "bootstrap.admin_created", "User", user.id);
  return { user, created: true };
}
