"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { currentUser, HOLDER_COOKIE, SELF_HOLDER } from "@/server/session";
import { prisma } from "@/server/db";

/** Troca o titular do seletor global. Gravado no servidor para a página re-renderizar já filtrada. */
export async function selectHolder(holderId: string) {
  const user = await currentUser();
  if (!user) return { ok: false as const, erro: "Não autenticado" };
  const jar = await cookies();
  if (!holderId) {
    jar.delete(HOLDER_COOKIE);
  } else {
    const h = await prisma.holder.findFirst({ where: holderId === SELF_HOLDER ? { userId: user.id, isSelf: true } : { id: holderId, userId: user.id }, select: { id: true } });
    if (!h) return { ok: false as const, erro: holderId === SELF_HOLDER ? "Marque em Programas › Titulares qual titular é você" : "Titular não encontrado" };
    jar.set(HOLDER_COOKIE, holderId === SELF_HOLDER ? SELF_HOLDER : h.id, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  revalidatePath("/app", "layout");
  return { ok: true as const };
}

