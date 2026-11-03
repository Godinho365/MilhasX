// Grupo "Milhas": clubes de pontos das contas e o radar do ViajeFácil (reservas Smiles com prazo para quitar em milhas).
import { prisma, DomainError } from "../db";
import { brDay } from "@/domain/brasilia";
import { deadlineStatus } from "@/domain/viaje-facil";

/* ---------------- Clubes ---------------- */

/** Pontos por mês de cada frequência (o clube anual vira 1/12 por mês, o trimestral 1/3). */
const PER_MONTH: Record<string, number> = { DAILY: 30, WEEKLY: 52 / 12, MONTHLY: 1, QUARTERLY: 1 / 3, YEARLY: 1 / 12 };

/** Clubes = lançamentos recorrentes de clube das contas, com o custo do milheiro e o bônus de transferência da conta.
 *  Conta sem recorrência mas com bônus de clube ou pontos de clube lançados no extrato também entra ("pelo extrato"):
 *  mostra o último crédito, sem frequência, e fica fora da soma por mês. */
export async function listClubs(userId: string, holderId?: string) {
  const recs = await prisma.recurrence.findMany({
    where: { userId, type: "CLUB", account: holderId ? { holderId } : undefined },
    include: { account: { include: { program: true, holder: true } } },
    orderBy: [{ active: "desc" }, { nextDate: "asc" }],
  });
  const rows = recs.map((r) => {
    const perMonth = (PER_MONTH[r.frequency] ?? 1) / Math.max(1, r.interval);
    return {
      id: r.id,
      source: "recurrence" as "recurrence" | "entries",
      lastDate: null as string | null,
      accountId: r.accountId,
      label: r.account.nickname || `${r.account.program.name} · ${r.account.holder.name}`,
      color: r.account.program.color,
      description: r.description,
      active: r.active && (!r.endDate || r.endDate >= new Date()),
      frequency: r.frequency as string,
      interval: r.interval,
      points: r.points,
      costCents: r.costCents,
      monthlyPoints: Math.round(r.points * perMonth),
      monthlyCents: Math.round(r.costCents * perMonth),
      cpmCents: r.points > 0 && r.costCents > 0 ? Math.round((r.costCents * 1000) / r.points) : null,
      nextDate: r.nextDate.toISOString(),
      endDate: r.endDate?.toISOString() ?? null,
      notify: r.notify,
      bonusPct: r.account.transferBonusPct,
      bonusCap: r.account.transferBonusCap,
    };
  });
  // clubes que só aparecem pelo bônus da conta ou pelos pontos de clube no extrato
  const withRec = new Set(recs.map((r) => r.accountId));
  const accounts = await prisma.account.findMany({
    where: { userId, archived: false, holderId, id: { notIn: [...withRec] }, OR: [{ transferBonusPct: { not: null } }, { entries: { some: { type: "CLUB" } } }] },
    include: { program: true, holder: true, entries: { where: { type: "CLUB" }, orderBy: { occurredAt: "desc" }, take: 1 } },
    orderBy: [{ program: { name: "asc" } }, { holder: { name: "asc" } }],
  });
  const recent = Date.now() - 35 * 86_400_000;
  for (const a of accounts) {
    const last = a.entries[0];
    rows.push({
      id: `acc:${a.id}`,
      source: "entries",
      lastDate: last?.occurredAt.toISOString() ?? null,
      accountId: a.id,
      label: a.nickname || `${a.program.name} · ${a.holder.name}`,
      color: a.program.color,
      description: last ? last.description : "Bônus de clube na conta",
      active: a.transferBonusPct != null || (!!last && last.occurredAt.getTime() >= recent),
      frequency: "",
      interval: 1,
      points: last?.points ?? 0,
      costCents: last?.inputCostCents ?? 0,
      monthlyPoints: 0,
      monthlyCents: 0,
      cpmCents: last && last.points > 0 && last.inputCostCents > 0 ? Math.round((last.inputCostCents * 1000) / last.points) : null,
      nextDate: "",
      endDate: null,
      notify: false,
      bonusPct: a.transferBonusPct,
      bonusCap: a.transferBonusCap,
    });
  }
  const on = rows.filter((r) => r.active && r.source === "recurrence");
  const monthlyPoints = on.reduce((t, r) => t + r.monthlyPoints, 0);
  const monthlyCents = on.reduce((t, r) => t + r.monthlyCents, 0);
  return {
    rows,
    totals: { active: rows.filter((r) => r.active).length, withoutRecurrence: rows.filter((r) => r.source === "entries").length, monthlyPoints, monthlyCents, cpmCents: monthlyPoints > 0 && monthlyCents > 0 ? Math.round((monthlyCents * 1000) / monthlyPoints) : null },
  };
}

/* ---------------- ViajeFácil ---------------- */

export type ViajeFacilInput = {
  customerName: string;
  deadline: Date;
  miles: number;
  roundTrip?: boolean;
  origin?: string | null;
  destination?: string | null;
  cabin?: string | null;
  passengers?: string[];
  milesInAccount?: boolean;
  notes?: string | null;
};

const clean = (i: ViajeFacilInput) => ({
  customerName: i.customerName.trim(),
  deadline: i.deadline,
  miles: i.miles,
  roundTrip: !!i.roundTrip,
  origin: i.origin?.trim().toUpperCase() || null,
  destination: i.destination?.trim().toUpperCase() || null,
  cabin: i.cabin || null,
  passengers: (i.passengers ?? []).map((p) => p.trim()).filter(Boolean),
  milesInAccount: !!i.milesInAccount,
  notes: i.notes?.trim() || null,
});

function present(v: Awaited<ReturnType<typeof prisma.viajeFacil.findFirstOrThrow>>, today: string) {
  return { ...v, deadline: v.deadline.toISOString(), paidAt: v.paidAt?.toISOString() ?? null, createdAt: v.createdAt.toISOString(), updatedAt: v.updatedAt.toISOString(), ...deadlineStatus(v.deadline.toISOString(), !!v.paidAt, today) };
}
export type ViajeFacilView = ReturnType<typeof present>;

/** Abertas primeiro, pela data limite; quitadas no fim. Com os totais do radar. */
export async function listViajeFacil(userId: string, now = new Date()) {
  const today = brDay(now);
  const rows = (await prisma.viajeFacil.findMany({ where: { userId }, orderBy: [{ deadline: "asc" }, { createdAt: "asc" }] })).map((v) => present(v, today));
  const items = [...rows.filter((r) => r.status !== "paid"), ...rows.filter((r) => r.status === "paid").reverse()];
  const open = rows.filter((r) => r.status !== "paid");
  return {
    items,
    totals: {
      open: open.length,
      miles: open.reduce((t, r) => t + r.miles, 0),
      overdue: open.filter((r) => r.status === "overdue").length,
      soon: open.filter((r) => r.status === "today" || r.status === "soon").length,
      missingMiles: open.filter((r) => !r.milesInAccount).reduce((t, r) => t + r.miles, 0),
    },
  };
}

async function own(userId: string, id: string) {
  const v = await prisma.viajeFacil.findFirst({ where: { id, userId } });
  if (!v) throw new DomainError(404, "Entrada não encontrada");
  return v;
}

export async function createViajeFacil(userId: string, input: ViajeFacilInput) {
  const v = await prisma.viajeFacil.create({ data: { userId, ...clean(input) } });
  return present(v, brDay());
}

export async function updateViajeFacil(userId: string, id: string, input: ViajeFacilInput) {
  await own(userId, id);
  return present(await prisma.viajeFacil.update({ where: { id }, data: clean(input) }), brDay());
}

/** Quitada (com a data) ou volta a ficar em aberto. */
export async function setViajeFacilPaid(userId: string, id: string, paid: boolean, now = new Date()) {
  await own(userId, id);
  return present(await prisma.viajeFacil.update({ where: { id }, data: { paidAt: paid ? now : null } }), brDay(now));
}

export async function deleteViajeFacil(userId: string, id: string) {
  await own(userId, id);
  await prisma.viajeFacil.delete({ where: { id } });
}
