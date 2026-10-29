import { prisma, DomainError } from "../db";
import { PROGRAM_BY_KEY, validateSearch, type SearchParams } from "@/domain/flight-search";

// Buscador: histórico de pesquisas e cotações anotadas (comparador). As cotações são a base do
// futuro tradutor de milhas (quanto um trecho costuma custar em cada programa).

const SEARCH_KEEP = 30;

export async function logSearch(userId: string, params: SearchParams, programs: string[]) {
  const err = validateSearch(params);
  if (err) throw new DomainError(400, err);
  const valid = programs.filter((p) => PROGRAM_BY_KEY[p]);
  await prisma.flightSearch.create({ data: { userId, params, programs: valid } });
  // Mantém só as mais recentes
  const old = await prisma.flightSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, skip: SEARCH_KEEP, select: { id: true } });
  if (old.length) await prisma.flightSearch.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
}

export async function listSearches(userId: string) {
  const rows = await prisma.flightSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: SEARCH_KEEP });
  return rows.map((r) => ({ id: r.id, params: r.params as SearchParams, programs: r.programs, createdAt: r.createdAt.toISOString() }));
}
export const clearSearches = (userId: string) => prisma.flightSearch.deleteMany({ where: { userId } });

export type QuoteInput = {
  orderId?: string | null;
  program: string;
  origin: string;
  destination: string;
  departDate: string;
  returnDate?: string | null;
  cabin: string;
  adults: number;
  miles?: number | null;
  taxesCents?: number | null;
  cashCents?: number | null;
  notes?: string | null;
};

export async function addQuote(userId: string, input: QuoteInput) {
  if (!PROGRAM_BY_KEY[input.program]) throw new DomainError(400, "Programa inválido");
  if (!input.miles && !input.cashCents) throw new DomainError(400, "Informe as milhas ou o valor em reais");
  if (input.orderId && !(await prisma.travelOrder.findFirst({ where: { id: input.orderId, userId }, select: { id: true } }))) throw new DomainError(404, "Pedido não encontrado");
  const q = await prisma.flightQuote.create({
    data: {
      userId, orderId: input.orderId || null, program: input.program, origin: input.origin, destination: input.destination,
      departDate: new Date(`${input.departDate}T00:00:00Z`), returnDate: input.returnDate ? new Date(`${input.returnDate}T00:00:00Z`) : null,
      cabin: input.cabin, adults: input.adults, miles: input.miles ?? null, taxesCents: input.taxesCents ?? null, cashCents: input.cashCents ?? null, notes: input.notes?.trim() || null,
    },
  });
  if (q.orderId) await prisma.orderEvent.create({ data: { orderId: q.orderId, type: "quote", note: `${PROGRAM_BY_KEY[q.program]!.label}: ${q.miles ? `${q.miles.toLocaleString("pt-BR")} milhas` : ""}${q.cashCents ? ` R$ ${(q.cashCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : ""}` } });
  return quoteView(q);
}

const quoteView = (q: Awaited<ReturnType<typeof prisma.flightQuote.create>>) => ({
  id: q.id, orderId: q.orderId, program: q.program, label: PROGRAM_BY_KEY[q.program]?.label ?? q.program,
  origin: q.origin, destination: q.destination, departDate: q.departDate.toISOString().slice(0, 10), returnDate: q.returnDate?.toISOString().slice(0, 10) ?? null,
  cabin: q.cabin, adults: q.adults, miles: q.miles, taxesCents: q.taxesCents, cashCents: q.cashCents, notes: q.notes, createdAt: q.createdAt.toISOString(),
});
export type QuoteView = ReturnType<typeof quoteView>;

/**
 * Cotações de um pedido, ou de um trecho (para comparar), da mais barata para a mais cara em reais:
 * milhas de programas diferentes não se comparam entre si. Custo = valor em dinheiro anotado ou,
 * sem ele, milhas pelo valor de mercado do milheiro do programa + taxas (estimado).
 */
export async function listQuotes(userId: string, f: { orderId?: string; origin?: string; destination?: string }) {
  const rows = await prisma.flightQuote.findMany({
    where: { userId, orderId: f.orderId, origin: f.origin, destination: f.destination },
    orderBy: [{ createdAt: "desc" }],
    take: 100,
  });
  const codes = [...new Set(rows.map((r) => PROGRAM_CODE[r.program]).filter((c): c is string => !!c))];
  const market = new Map((await prisma.program.findMany({ where: { code: { in: codes } }, select: { code: true, marketValueCpmCents: true } })).map((p) => [p.code, p.marketValueCpmCents]));
  return rows
    .map((r) => {
      const cpm = market.get(PROGRAM_CODE[r.program] ?? "");
      const costCents = r.cashCents ?? (r.miles && cpm ? Math.round((r.miles * cpm) / 1000) + (r.taxesCents ?? 0) : null);
      return { ...quoteView(r), costCents, costEstimated: r.cashCents == null && costCents != null };
    })
    .sort((a, b) => (a.costCents ?? Infinity) - (b.costCents ?? Infinity) || (a.miles ?? Infinity) - (b.miles ?? Infinity));
}

export async function updateQuote(userId: string, id: string, input: Pick<QuoteInput, "program" | "miles" | "taxesCents" | "cashCents" | "notes">) {
  if (!PROGRAM_BY_KEY[input.program]) throw new DomainError(400, "Programa inválido");
  if (!input.miles && !input.cashCents) throw new DomainError(400, "Informe as milhas ou o valor em reais");
  const { count } = await prisma.flightQuote.updateMany({
    where: { id, userId },
    data: { program: input.program, miles: input.miles ?? null, taxesCents: input.taxesCents ?? null, cashCents: input.cashCents ?? null, notes: input.notes?.trim() || null },
  });
  if (!count) throw new DomainError(404, "Cotação não encontrada");
  return quoteView(await prisma.flightQuote.findUniqueOrThrow({ where: { id } }));
}

export async function deleteQuote(userId: string, id: string) {
  const { count } = await prisma.flightQuote.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Cotação não encontrada");
}

/* ---------------- Tradutor de milhas ---------------- */

// Faixas de antecedência: dias entre o dia em que a cotação foi anotada e a data do voo
export const LEAD_BUCKETS = [
  { key: "0-7", label: "Até 7 dias", max: 7 },
  { key: "8-30", label: "8 a 30 dias", max: 30 },
  { key: "31-60", label: "31 a 60 dias", max: 60 },
  { key: "61-120", label: "61 a 120 dias", max: 120 },
  { key: "121+", label: "Mais de 120 dias", max: Infinity },
] as const;

// Programa do buscador → código do programa no MilhasX (para o valor de mercado do milheiro)
const PROGRAM_CODE: Record<string, string> = { smiles: "SMILES", latam: "LATAM", azul: "AZUL", "azul-mundo": "AZUL" };

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
};

/**
 * Quanto um trecho costuma custar em cada programa, conforme a antecedência, a partir das cotações
 * anotadas pelo próprio usuário. Milhas por adulto (a cotação vale para o grupo inteiro).
 */
export async function translateRoute(userId: string, f: { origin: string; destination: string; roundTrip: boolean; cabin: string }) {
  const rows = await prisma.flightQuote.findMany({
    where: { userId, origin: f.origin, destination: f.destination, cabin: f.cabin, returnDate: f.roundTrip ? { not: null } : null, miles: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const codes = [...new Set(rows.map((r) => PROGRAM_CODE[r.program]).filter((c): c is string => !!c))];
  const market = new Map((await prisma.program.findMany({ where: { code: { in: codes } }, select: { code: true, marketValueCpmCents: true } })).map((p) => [p.code, p.marketValueCpmCents]));
  const by = new Map<string, { miles: number[]; taxes: number[]; buckets: Map<string, number[]>; last: Date }>();
  for (const r of rows) {
    const perPax = Math.round(r.miles! / Math.max(1, r.adults));
    const lead = Math.max(0, Math.round((r.departDate.getTime() - Date.UTC(r.createdAt.getUTCFullYear(), r.createdAt.getUTCMonth(), r.createdAt.getUTCDate())) / 86400_000));
    const bucket = LEAD_BUCKETS.find((b) => lead <= b.max)!.key;
    const cur = by.get(r.program) ?? { miles: [] as number[], taxes: [] as number[], buckets: new Map<string, number[]>(), last: r.createdAt };
    cur.miles.push(perPax);
    if (r.taxesCents != null) cur.taxes.push(Math.round(r.taxesCents / Math.max(1, r.adults)));
    cur.buckets.set(bucket, [...(cur.buckets.get(bucket) ?? []), perPax]);
    if (r.createdAt > cur.last) cur.last = r.createdAt;
    by.set(r.program, cur);
  }
  const programs = [...by.entries()].map(([key, v]) => {
    const typical = median(v.miles);
    const cpm = market.get(PROGRAM_CODE[key] ?? "");
    return {
      key,
      label: PROGRAM_BY_KEY[key]?.label ?? key,
      samples: v.miles.length,
      typical,
      min: Math.min(...v.miles),
      max: Math.max(...v.miles),
      taxesCents: v.taxes.length ? median(v.taxes) : null,
      // Valor em reais das milhas típicas, pelo preço de mercado do milheiro do programa
      marketCents: cpm ? Math.round((typical * cpm) / 1000) : null,
      lastAt: v.last.toISOString(),
      byLead: LEAD_BUCKETS.map((b) => {
        const xs = v.buckets.get(b.key) ?? [];
        return { key: b.key, label: b.label, samples: xs.length, typical: xs.length ? median(xs) : null };
      }),
    };
  });
  programs.sort((a, b) => a.typical - b.typical);
  return { samples: rows.length, programs };
}

/** Trechos que já têm cotações (atalhos do tradutor). */
export async function quotedRoutes(userId: string) {
  const rows = await prisma.flightQuote.groupBy({ by: ["origin", "destination", "cabin"], where: { userId, miles: { not: null } }, _count: { _all: true }, _max: { createdAt: true }, orderBy: { _max: { createdAt: "desc" } }, take: 12 });
  return rows.map((r) => ({ origin: r.origin, destination: r.destination, cabin: r.cabin, samples: r._count._all }));
}
