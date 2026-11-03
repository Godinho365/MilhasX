// Contatos: passageiros (CPF, nascimento, cliente, última conta usada) e interesses de viagem dos clientes.
import { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { brDay } from "@/domain/brasilia";

const onlyDigits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "") || null;
const day = (d: Date) => d.toISOString().slice(0, 10);

/* ---------------- Passageiros ---------------- */

export type PassengerInput = { name: string; cpf?: string | null; birthDate?: Date | null; email?: string | null; phone?: string | null; customerId?: string | null; notes?: string | null };

async function checkCustomer(userId: string, customerId?: string | null) {
  if (customerId && !(await prisma.customer.findFirst({ where: { id: customerId, userId }, select: { id: true } }))) throw new DomainError(404, "Cliente não encontrado");
}
const passengerData = (i: PassengerInput) => ({
  name: i.name.trim(), cpf: onlyDigits(i.cpf), birthDate: i.birthDate ?? null, email: i.email?.trim() || null, phone: i.phone?.trim() || null,
  customerId: i.customerId || null, notes: i.notes?.trim() || null,
});
const dupCpf = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

export async function savePassenger(userId: string, id: string | null, input: PassengerInput) {
  await checkCustomer(userId, input.customerId);
  const data = passengerData(input);
  if (data.cpf && data.cpf.length !== 11) throw new DomainError(400, "CPF precisa ter 11 dígitos");
  try {
    if (!id) return (await prisma.passenger.create({ data: { userId, ...data } })).id;
    const { count } = await prisma.passenger.updateMany({ where: { id, userId }, data });
    if (!count) throw new DomainError(404, "Passageiro não encontrado");
    return id;
  } catch (e) {
    if (dupCpf(e)) throw new DomainError(409, "Já existe um passageiro com esse CPF");
    throw e;
  }
}

export async function deletePassenger(userId: string, id: string) {
  const { count } = await prisma.passenger.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Passageiro não encontrado");
}

/** Traz para a lista os passageiros já emitidos nas contas (CPFs usados), sem repetir quem já está cadastrado. */
export async function importPassengersFromAccounts(userId: string) {
  const used = await prisma.accountBeneficiary.findMany({ where: { userId, document: { not: null } }, orderBy: { usedAt: "desc" }, select: { name: true, document: true } });
  const have = new Set((await prisma.passenger.findMany({ where: { userId, cpf: { not: null } }, select: { cpf: true } })).map((p) => p.cpf));
  const fresh = new Map<string, string>();
  for (const u of used) {
    const cpf = onlyDigits(u.document);
    if (cpf && cpf.length === 11 && !have.has(cpf) && !fresh.has(cpf)) fresh.set(cpf, u.name.trim());
  }
  if (fresh.size) await prisma.passenger.createMany({ data: [...fresh].map(([cpf, name]) => ({ userId, cpf, name })), skipDuplicates: true });
  return fresh.size;
}

/** Lista com a última conta em que o CPF foi usado, aniversariantes do mês e dos próximos 7 dias. */
export async function listPassengers(userId: string, opts: { q?: string } = {}, now = new Date()) {
  const q = opts.q?.trim();
  const rows = await prisma.passenger.findMany({
    where: { userId, ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { cpf: { contains: q.replace(/\D/g, "") || q } }] } : {}) },
    include: { customer: { select: { id: true, name: true } } },
    orderBy: { name: "asc" },
  });
  const cpfs = rows.map((r) => r.cpf).filter((c): c is string => !!c);
  const uses = cpfs.length
    ? await prisma.accountBeneficiary.findMany({ where: { userId, document: { in: cpfs } }, orderBy: { usedAt: "desc" }, include: { account: { include: { program: true, holder: true } } } })
    : [];
  const last = new Map<string, (typeof uses)[number]>();
  for (const u of uses) if (u.document && !last.has(u.document)) last.set(u.document, u);
  const today = brDay(now);
  const md = (d: Date) => d.toISOString().slice(5, 10);
  const nextDays = new Set(Array.from({ length: 8 }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) + i * 86_400_000).toISOString().slice(5, 10)));
  const items = rows.map((p) => {
    const u = p.cpf ? last.get(p.cpf) : undefined;
    return {
      id: p.id, name: p.name, cpf: p.cpf, birthDate: p.birthDate ? day(p.birthDate) : null, email: p.email, phone: p.phone, notes: p.notes,
      customerId: p.customerId, customer: p.customer?.name ?? null,
      lastUse: u ? { date: day(u.usedAt), account: u.account.nickname || `${u.account.program.name} · ${u.account.holder.name}` } : null,
      birthdayMonth: !!p.birthDate && md(p.birthDate).slice(0, 2) === today.slice(5, 7),
      birthdaySoon: !!p.birthDate && nextDays.has(md(p.birthDate)),
      createdAt: p.createdAt.toISOString(),
    };
  });
  const since = now.getTime() - 30 * 86_400_000;
  return {
    items,
    totals: { total: items.length, recent: rows.filter((r) => r.createdAt.getTime() >= since).length, withCpf: items.filter((i) => i.cpf).length, birthdayMonth: items.filter((i) => i.birthdayMonth).length, birthdaySoon: items.filter((i) => i.birthdaySoon).length },
  };
}

/* ---------------- Interesses de viagem ---------------- */

export type InterestInput = { customerId?: string | null; customerName: string; origin?: string | null; destination: string; month?: string | null; priority: string; status: string; programs?: string[]; notes?: string | null };

export async function saveInterest(userId: string, id: string | null, input: InterestInput) {
  await checkCustomer(userId, input.customerId);
  const customerName = input.customerId ? (await prisma.customer.findFirst({ where: { id: input.customerId }, select: { name: true } }))!.name : input.customerName.trim();
  const data = {
    customerId: input.customerId || null, customerName, origin: input.origin?.trim().toUpperCase() || null, destination: input.destination.trim(),
    month: input.month || null, priority: input.priority, status: input.status, programs: input.programs ?? [], notes: input.notes?.trim() || null,
  };
  if (!id) return (await prisma.travelInterest.create({ data: { userId, ...data, offerSentAt: data.status === "OFFER_SENT" ? new Date() : null } })).id;
  const cur = await prisma.travelInterest.findFirst({ where: { id, userId } });
  if (!cur) throw new DomainError(404, "Interesse não encontrado");
  await prisma.travelInterest.update({ where: { id }, data: { ...data, offerSentAt: data.status === "OFFER_SENT" && cur.status !== "OFFER_SENT" ? new Date() : cur.offerSentAt } });
  return id;
}

export async function setInterestStatus(userId: string, id: string, status: string) {
  const cur = await prisma.travelInterest.findFirst({ where: { id, userId } });
  if (!cur) throw new DomainError(404, "Interesse não encontrado");
  await prisma.travelInterest.update({ where: { id }, data: { status, offerSentAt: status === "OFFER_SENT" && cur.status !== "OFFER_SENT" ? new Date() : cur.offerSentAt } });
}

export async function deleteInterest(userId: string, id: string) {
  const { count } = await prisma.travelInterest.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Interesse não encontrado");
}

export async function listInterests(userId: string, f: { status?: string; priority?: string; month?: string } = {}) {
  const rows = await prisma.travelInterest.findMany({
    where: { userId, status: f.status || undefined, priority: f.priority || undefined, month: f.month || undefined },
    orderBy: [{ updatedAt: "desc" }],
  });
  return rows.map((r) => ({ ...r, offerSentAt: r.offerSentAt?.toISOString() ?? null, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString() }));
}
