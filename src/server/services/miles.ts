// Grupo "Milhas": clubes de pontos das contas e o radar do ViajeFácil (reservas Smiles com prazo para quitar em milhas).
import { prisma, DomainError } from "../db";
import { brDay } from "@/domain/brasilia";
import { deadlineStatus } from "@/domain/viaje-facil";
import { projectClub, type ClubEvent, type ClubFreq } from "@/domain/club-calendar";

/* ---------------- Clubes ---------------- */

/** Calendário dos clubes no ano: os planos de cada conta (assinatura, dia da cobrança, próxima, fim) e as cobranças
 *  dia a dia. O que já passou vem dos pontos de clube do Extrato; daqui para a frente, da recorrência do clube. */
export async function clubCalendar(userId: string, holderId: string | undefined, year: number) {
  const today = brDay();
  const from = `${year}-01-01`, to = `${year}-12-31`;
  const recs = await prisma.recurrence.findMany({
    where: { userId, type: "CLUB", account: { archived: false, ...(holderId ? { holderId } : {}) } },
    include: { account: { include: { program: true, holder: true } } },
  });
  const withRec = new Set(recs.map((r) => r.accountId));
  const loose = await prisma.account.findMany({
    where: { userId, archived: false, ...(holderId ? { holderId } : {}), id: { notIn: [...withRec] }, entries: { some: { type: "CLUB", occurredAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) } } } },
    include: { program: true, holder: true },
  });
  const accountIds = [...withRec, ...loose.map((a) => a.id)];
  const [entries, firsts] = await Promise.all([
    prisma.entry.findMany({
      where: { userId, type: "CLUB", accountId: { in: accountIds }, occurredAt: { gte: new Date(`${from}T00:00:00Z`), lte: new Date(`${to}T23:59:59Z`) } },
      select: { accountId: true, occurredAt: true, points: true, inputCostCents: true },
    }),
    prisma.entry.groupBy({ by: ["accountId"], where: { userId, type: "CLUB", accountId: { in: accountIds } }, _min: { occurredAt: true } }),
  ]);
  const signed = new Map(firsts.map((f) => [f.accountId, f._min.occurredAt ? f._min.occurredAt.toISOString().slice(0, 10) : null]));
  const day = (d: Date) => d.toISOString().slice(0, 10);

  // um clube por conta (com recorrência, ou só com pontos de clube no Extrato)
  const clubs = [
    ...recs.map((r) => ({
      id: r.accountId, accountId: r.accountId, program: r.account.program.name, holder: r.account.holder.name, color: r.account.program.color,
      label: r.account.nickname || `${r.account.program.name} · ${r.account.holder.name}`, description: r.description,
      points: r.points, costCents: r.costCents, frequency: r.frequency as ClubFreq, interval: r.interval,
      chargeDay: r.dayOfMonth ?? r.nextDate.getUTCDate(), signedAt: signed.get(r.accountId) ?? day(r.createdAt),
      nextDate: r.active ? day(r.nextDate) : null, endDate: r.endDate ? day(r.endDate) : null,
      active: r.active && (!r.endDate || day(r.endDate) >= today), fromEntries: false,
      rec: r,
    })),
    ...loose.map((a) => ({
      id: a.id, accountId: a.id, program: a.program.name, holder: a.holder.name, color: a.program.color,
      label: a.nickname || `${a.program.name} · ${a.holder.name}`, description: "Pontos de clube lançados no Extrato (sem recorrência)",
      points: 0, costCents: 0, frequency: "MONTHLY" as ClubFreq, interval: 1, chargeDay: null as number | null, signedAt: signed.get(a.id) ?? null,
      nextDate: null as string | null, endDate: null as string | null, active: false, fromEntries: true, rec: null,
    })),
  ].sort((a, b) => a.program.localeCompare(b.program) || a.holder.localeCompare(b.holder));

  // já aconteceu: o Extrato; vem pela frente: a recorrência (a partir da próxima data, sem repetir o que já foi lançado)
  const past: ClubEvent[] = entries.map((e) => ({ clubId: e.accountId, day: day(e.occurredAt), points: e.points, costCents: e.inputCostCents, projected: false }));
  const future = clubs.flatMap((c) => {
    if (!c.rec || !c.active || !c.nextDate) return [];
    const start = c.nextDate > today ? c.nextDate : today;
    return projectClub({ id: c.id, nextDate: c.nextDate, frequency: c.frequency, interval: c.interval, dayOfMonth: c.rec.dayOfMonth, endDate: c.endDate, points: c.points, costCents: c.costCents }, start < from ? from : start, to);
  });
  return { year, today, clubs: clubs.map(({ rec: _rec, ...c }) => c), events: [...past, ...future] };
}


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
      description: last ? last.description : "Bônus de clube configurado, sem pontos de clube lançados",
      // mesma regra do resto do app (clubActiveAccounts): ativo só com pontos de clube nos últimos 35 dias;
      // o bônus configurado na conta sozinho não diz que o clube está pago
      active: !!last && last.occurredAt.getTime() >= recent,
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
