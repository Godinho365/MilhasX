// Seletor global de titular: o que está escolhido fica num cookie ("" = todos, "self" = minhas contas, ou o id).
import { prisma, DomainError } from "../db";

export const HOLDER_CHOICE_COOKIE = "mm_holder";
/** Valor especial do seletor: o titular marcado como "sou eu". */
export const SELF_HOLDER = "self";

const YEAR_S = 60 * 60 * 24 * 365;

/** Titular do usuário para o valor do seletor (null se não existe ou não é dele). */
export function findChosenHolder(userId: string, value: string) {
  return prisma.holder.findFirst({ where: value === SELF_HOLDER ? { userId, isSelf: true } : { id: value, userId }, select: { id: true } });
}

/** Valida a escolha e devolve o Set-Cookie que a grava (vazio = todos os titulares, apaga o cookie). */
export async function holderChoiceCookie(userId: string, value: string) {
  if (!value) return `${HOLDER_CHOICE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  const h = await findChosenHolder(userId, value);
  if (!h) throw new DomainError(404, value === SELF_HOLDER ? "Marque em Programas › Titulares qual titular é você" : "Titular não encontrado");
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${HOLDER_CHOICE_COOKIE}=${value === SELF_HOLDER ? SELF_HOLDER : h.id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${YEAR_S}${secure}`;
}
