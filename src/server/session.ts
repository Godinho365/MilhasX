import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getUserByToken, SESSION_COOKIE } from "./auth";
import { prisma } from "./db";
import { findChosenHolder, HOLDER_CHOICE_COOKIE, SELF_HOLDER } from "./services/holder-choice";

export const HOLDER_COOKIE = HOLDER_CHOICE_COOKIE;
export { SELF_HOLDER };

export async function currentUser() {
  const jar = await cookies();
  return getUserByToken(jar.get(SESSION_COOKIE)?.value);
}

export async function requirePageUser() {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

export async function requirePageAdmin() {
  const u = await requirePageUser();
  if (u.role !== "ADMIN") redirect("/app");
  return u;
}

/** Titular selecionado no seletor global (validado contra o usuário). */
export async function selectedHolderId(userId: string) {
  const id = (await cookies()).get(HOLDER_COOKIE)?.value;
  if (!id) return undefined;
  return (await findChosenHolder(userId, id))?.id;
}

/** Texto do escopo atual para os cabeçalhos: "Titular: Fulano" ou "Todos os titulares". */
export async function holderScopeLabel(holderId: string | undefined) {
  if (!holderId) return "Todos os titulares";
  const h = await prisma.holder.findUnique({ where: { id: holderId }, select: { name: true } });
  return h ? `Titular: ${h.name}` : "Todos os titulares";
}

/** O que está escolhido no seletor ("" = todos, "self" = minhas contas, ou o id do titular). */
export async function selectedHolderValue(userId: string) {
  const id = (await cookies()).get(HOLDER_COOKIE)?.value ?? "";
  if (id === "" || id === SELF_HOLDER) return id;
  return (await selectedHolderId(userId)) ?? "";
}

export const appName = () => process.env.APP_NAME || "MilhasX";
/** Marca da página pública das agências (a "Central de Atendimento"), como a simbora.la do Quero Milhas. */
export const publicBrand = () => process.env.PUBLIC_BRAND || "MilhasX";
