// Bônus de transferência do mês por conta (horário de Brasília) e o aviso do dia 1º.
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { brWindows } from "@/domain/brasilia";
import { bonusCapStatus, type BonusCap } from "@/domain/transfer-bonus";
import { clubActiveAccounts } from "./wallet";

const monthStart = (now: Date) => new Date(`${brWindows(now).month}T00:00:00Z`);

/** Contas com limite mensal de bônus: quanto já entrou de bônus neste mês e quanto ainda cabe. */
export async function bonusUsage(userId: string, now = new Date(), accountId?: string) {
  const accounts = await prisma.account.findMany({
    where: { userId, id: accountId, archived: false, transferBonusCap: { not: null } },
    select: { id: true, nickname: true, transferBonusCap: true, transferBonusPct: true, program: { select: { name: true } }, holder: { select: { name: true } } },
    orderBy: [{ program: { name: "asc" } }, { holder: { name: "asc" } }],
  });
  if (!accounts.length) return [];
  const [sums, clubs] = await Promise.all([
    prisma.entry.groupBy({
      by: ["accountId"],
      where: { userId, accountId: { in: accounts.map((a) => a.id) }, type: "TRANSFER_BONUS", status: "CONFIRMED", occurredAt: { gte: monthStart(now) } },
      _sum: { points: true },
    }),
    clubActiveAccounts(userId, now),
  ]);
  const used = new Map(sums.map((s) => [s.accountId, s._sum.points ?? 0]));
  return accounts.map((a) => ({
    accountId: a.id,
    label: a.nickname || `${a.program.name} · ${a.holder.name}`,
    bonusPct: a.transferBonusPct,
    clubActive: clubs.has(a.id),
    ...bonusCapStatus(a.transferBonusCap!, used.get(a.id) ?? 0, a.transferBonusPct),
  })) satisfies (BonusCap & Record<string, unknown>)[];
}

/** Uma vez por mês (no 1º acesso a partir do dia 1º): avisa que o limite de bônus renovou. */
export async function notifyMonthlyBonus(userId: string, now = new Date()) {
  const key = `transfer-bonus:${brWindows(now).month.slice(0, 7)}`;
  if (await prisma.notification.findUnique({ where: { userId_key: { userId, key } }, select: { id: true } })) return false;
  const rows = (await bonusUsage(userId, now)).filter((r) => r.clubActive);
  if (!rows.length) return false;
  const pts = (n: number) => n.toLocaleString("pt-BR");
  const body = rows
    .map((r) => `${r.label}: até ${pts(r.left)} milhas de bônus${r.transferable ? ` (${r.bonusPct}%: transfira até ${pts(r.transferable)} pontos)` : ""}`)
    .join(" · ");
  try {
    await prisma.notification.create({ data: { userId, key, category: "points", title: "Bônus de transferência renovado", body: `Novo mês, limite de bônus renovado. ${body}.` } });
    return true;
  } catch (e) {
    // outra requisição já criou o aviso deste mês
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}
