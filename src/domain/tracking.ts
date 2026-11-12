// Acompanhamentos: os itens das vendas organizados pelos próximos embarques. Cada voo vira um trecho por linha
// (ida e volta); hospedagem, transporte, cruzeiro, seguro e adicionais viram uma linha do começo ao fim. Aqui
// ficam as abas, a situação de cada linha, os períodos, os indicadores e as viagens do mapa.
import { CHECKIN_DAYS_BEFORE, addDays, diffDays } from "./calendar";
import { itemFields, type SaleItemKind } from "./sale-items";
import { placeName } from "./geo";

export const TRACK_TABS = {
  voos: { none: "Nenhum voo encontrado", label: "Voos", kinds: ["FLIGHT"], one: "voo", many: "voos", subtitle: "Os voos das vendas, organizados pelos próximos embarques. Cada trecho aparece como um item: ida e volta.", missing: "Sem companhia", pending: "Check-in pendente", people: "Passageiros" },
  hospedagens: { none: "Nenhuma hospedagem encontrada", label: "Hospedagens", kinds: ["HOTEL"], one: "hospedagem", many: "hospedagens", subtitle: "As hospedagens vendidas: quem está hospedado agora, as próximas entradas e as que faltam confirmar com o hotel.", missing: "Sem hotel", pending: "A confirmar", people: "Hóspedes" },
  transportes: { none: "Nenhum transporte encontrado", label: "Transportes", kinds: ["CAR", "TRANSFER"], one: "transporte", many: "transportes", subtitle: "Aluguéis de carro e transfers vendidos, com retirada, devolução e horários.", missing: "Sem empresa", pending: "A confirmar", people: "Clientes" },
  cruzeiros: { none: "Nenhum cruzeiro encontrado", label: "Cruzeiros", kinds: ["CRUISE"], one: "cruzeiro", many: "cruzeiros", subtitle: "Os cruzeiros vendidos: embarque, desembarque e o check-in de cada um.", missing: "Sem navio", pending: "Check-in pendente", people: "Passageiros" },
  seguros: { none: "Nenhum seguro encontrado", label: "Seguros", kinds: ["INSURANCE"], one: "seguro", many: "seguros", subtitle: "Os seguros viagem vendidos e a vigência de cada um.", missing: "Sem seguradora", pending: "Apólice a enviar", people: "Segurados" },
  adicionais: { none: "Nenhum adicional encontrado", label: "Adicionais", kinds: ["BAGGAGE", "SEAT", "OTHER"], one: "adicional", many: "adicionais", subtitle: "Bagagens, assentos, passeios e outros serviços vendidos.", missing: "Sem fornecedor", pending: "A confirmar", people: "Clientes" },
} as const satisfies Record<string, { none: string; label: string; kinds: readonly SaleItemKind[]; one: string; many: string; subtitle: string; missing: string; pending: string; people: string }>;
export type TrackTab = keyof typeof TRACK_TABS;
export const TRACK_TAB_KEYS = Object.keys(TRACK_TABS) as TrackTab[];
export const isTrackTab = (t: string | null | undefined): t is TrackTab => !!t && t in TRACK_TABS;
export const tabOfKind = (k: string): TrackTab => TRACK_TAB_KEYS.find((t) => (TRACK_TABS[t].kinds as readonly string[]).includes(k)) ?? "adicionais";

/** O item da venda como os acompanhamentos leem (datas em AAAA-MM-DD). */
export type TrackItem = {
  id: string; saleId: string; kind: string;
  origin: string | null; destination: string | null;
  departureDate: string | null; returnDate: string | null; departureTime: string | null; returnTime: string | null;
  provider: string | null; reservation: string | null; passengers: number | null; description: string | null;
  customers: { id: string; name: string }[]; issuerIds: string[]; valueCents: number; program: string | null;
  doneOutAt: string | null; doneRetAt: string | null;
};

export type Leg = "OUT" | "RET" | "STAY";
export type TrackRow = {
  id: string; itemId: string; saleId: string; kind: string; leg: Leg;
  from: string | null; to: string | null; place: string | null;
  date: string; time: string | null; endDate: string | null; endTime: string | null;
  provider: string | null; reservation: string | null; passengers: number | null; description: string | null;
  customers: { id: string; name: string }[]; issuerIds: string[]; program: string | null;
  /** valor do item (no voo, fica no trecho de ida para não contar duas vezes) */
  valueCents: number;
  /** o item tem data de volta/fim (para editar o horário dela) */
  hasReturn: boolean;
  done: boolean; doneAt: string | null;
};

/** As linhas de um item: voo com ida e volta vira dois trechos; o resto, uma linha. Item sem data não entra. */
export function rowsOf(i: TrackItem): TrackRow[] {
  if (!i.departureDate) return [];
  const common = {
    itemId: i.id, saleId: i.saleId, kind: i.kind, provider: i.provider, reservation: i.reservation, passengers: i.passengers,
    description: i.description, customers: i.customers, issuerIds: i.issuerIds, program: i.program, hasReturn: !!i.returnDate,
  };
  if (i.kind === "FLIGHT") {
    const out: TrackRow[] = [{
      ...common, id: `${i.id}:out`, leg: "OUT", from: i.origin, to: i.destination, place: null, date: i.departureDate, time: i.departureTime,
      endDate: null, endTime: null, valueCents: i.valueCents, done: !!i.doneOutAt, doneAt: i.doneOutAt,
    }];
    if (i.returnDate) out.push({
      ...common, id: `${i.id}:ret`, leg: "RET", from: i.destination, to: i.origin, place: null, date: i.returnDate, time: i.returnTime,
      endDate: null, endTime: null, valueCents: 0, done: !!i.doneRetAt, doneAt: i.doneRetAt,
    });
    return out;
  }
  const route = itemFields(i.kind).route;
  return [{
    ...common, id: i.id, leg: "STAY", from: route ? i.origin : null, to: route ? i.destination : null, place: route ? null : i.destination,
    date: i.departureDate, time: i.departureTime, endDate: i.returnDate && i.returnDate > i.departureDate ? i.returnDate : null,
    endTime: i.returnDate ? i.returnTime : null, valueCents: i.valueCents, done: !!i.doneOutAt, doneAt: i.doneOutAt,
  }];
}

export const byWhen = (a: TrackRow, b: TrackRow) => a.date.localeCompare(b.date) || (a.time ?? "99").localeCompare(b.time ?? "99") || a.id.localeCompare(b.id);
const lastDay = (r: TrackRow) => r.endDate ?? r.date;

/** Título da linha: a rota do voo ("GRU → LIS"), o hotel/fornecedor ou o lugar. */
export function rowTitle(r: TrackRow) {
  if (r.from || r.to) return `${r.from ?? "?"} → ${r.to ?? "?"}`;
  return r.description?.trim() || r.provider?.trim() || placeName(r.place) || itemFields(r.kind).section;
}

/* ---------------- Situação ---------------- */

export type Tone = "muted" | "accent" | "ok" | "warn" | "info";
export type RowStatus = { key: "past" | "today" | "soon" | "future" | "ongoing" | "ended"; label: string; tone: Tone };

const ONGOING: Partial<Record<string, string>> = { HOTEL: "Hospedado", CAR: "Com o carro", CRUISE: "A bordo", INSURANCE: "Vigente" };
const ENDED: Partial<Record<string, string>> = { HOTEL: "Encerrada", INSURANCE: "Vencido" };
const inDays = (n: number) => (n === 1 ? "Amanhã" : `Em ${n} dias`);

export function rowStatus(r: TrackRow, today: string): RowStatus {
  const until = diffDays(r.date, today);
  if (r.leg !== "STAY") {
    if (until < 0) return { key: "past", label: "Voou", tone: "muted" };
    if (until === 0) return { key: "today", label: r.time ? `Hoje, ${r.time}` : "Hoje", tone: "accent" };
    return { key: until <= CHECKIN_DAYS_BEFORE ? "soon" : "future", label: inDays(until), tone: until <= CHECKIN_DAYS_BEFORE ? "info" : "muted" };
  }
  if (until > 0) return { key: until <= 7 ? "soon" : "future", label: inDays(until), tone: until <= 7 ? "info" : "muted" };
  if (lastDay(r) < today) return { key: "ended", label: ENDED[r.kind] ?? "Concluído", tone: "muted" };
  if (!r.endDate) return { key: "today", label: r.time ? `Hoje, ${r.time}` : "Hoje", tone: "accent" };
  return { key: "ongoing", label: ONGOING[r.kind] ?? "Em andamento", tone: "ok" };
}

/** Janela (dias antes) em que a linha ainda não marcada vira pendência: o check-in do voo abre 2 dias antes. */
export const pendingWindow = (kind: string) => (kind === "FLIGHT" ? CHECKIN_DAYS_BEFORE : 7);
export function isPending(r: TrackRow, today: string) {
  if (r.done) return false;
  const until = diffDays(r.date, today);
  return until >= 0 && until <= pendingWindow(r.kind);
}

/* ---------------- Períodos ---------------- */

export type Period = "proximos" | "7" | "30" | "todos" | "custom";
export const PERIODS: { key: Exclude<Period, "custom">; label: string }[] = [
  { key: "proximos", label: "Próximos" }, { key: "7", label: "7 dias" }, { key: "30", label: "30 dias" }, { key: "todos", label: "Todos" },
];
/** Quanto do passado o "Todos" mostra. */
export const HISTORY_DAYS = 365;
export type Range = { from: string | null; to: string | null };

export function periodRange(p: Period, today: string, custom?: { from?: string | null; to?: string | null }): Range {
  if (p === "7") return { from: today, to: addDays(today, 7) };
  if (p === "30") return { from: today, to: addDays(today, 30) };
  if (p === "todos") return { from: addDays(today, -HISTORY_DAYS), to: null };
  if (p === "custom") return { from: custom?.from ?? null, to: custom?.to ?? null };
  return { from: today, to: null };
}
/** A linha cai no período se algum dia dela está dentro (a hospedagem em andamento conta nos "Próximos"). */
export const inRange = (r: TrackRow, x: Range) => (!x.from || lastDay(r) >= x.from) && (!x.to || r.date <= x.to);
/** O período anterior, do mesmo tamanho (para comparar o valor); só existe com começo e fim. */
export function previousRange(x: Range): Range | null {
  if (!x.from || !x.to) return null;
  const len = diffDays(x.to, x.from) + 1;
  return { from: addDays(x.from, -len), to: addDays(x.from, -1) };
}

/* ---------------- Indicadores ---------------- */

export type TrackKpis = { valueCents: number; count: number; people: number; reservations: number; missing: number; pending: number; now: number };
export function trackKpis(rows: TrackRow[], today: string): TrackKpis {
  const items = new Map<string, TrackRow>();
  for (const r of rows) if (!items.has(r.itemId)) items.set(r.itemId, r);
  const reservations = new Set([...items.values()].map((r) => r.reservation?.trim().toUpperCase() || `item:${r.itemId}`));
  return {
    valueCents: rows.reduce((t, r) => t + r.valueCents, 0),
    count: rows.length,
    people: [...items.values()].reduce((t, r) => t + (r.passengers ?? Math.max(1, r.customers.length)), 0),
    reservations: reservations.size,
    missing: rows.filter((r) => !r.provider?.trim()).length,
    pending: rows.filter((r) => isPending(r, today)).length,
    now: rows.filter((r) => { const k = rowStatus(r, today).key; return k === "today" || k === "ongoing"; }).length,
  };
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** Busca por cliente, passageiro, rota (código ou cidade), companhia, localizador ou descrição. */
export function matches(r: TrackRow, q: string) {
  const t = fold(q.trim());
  if (!t) return true;
  const hay = [
    ...r.customers.map((c) => c.name), r.from, r.to, r.place, placeName(r.from), placeName(r.to), placeName(r.place),
    r.provider, r.reservation, r.description, r.program, rowTitle(r),
  ].filter(Boolean).join(" · ");
  return t.split(/\s+/).every((w) => fold(hay).includes(w));
}

/* ---------------- Mapa de viagens ---------------- */

export type MapStatus = "traveling" | "boarding" | "returning";
export const MAP_STATUS: Record<MapStatus, { label: string; color: string }> = {
  traveling: { label: "Em viagem", color: "#22c55e" },
  boarding: { label: "Embarque em 48h", color: "#f59e0b" },
  returning: { label: "Retorno hoje", color: "#3b82f6" },
};
export type Now = { day: string; time: string };
export type Trip = {
  id: string; status: MapStatus; at: string | null; kind: string;
  saleIds: string[]; customers: { id: string; name: string }[]; passengers: number | null;
  reservation: string | null; provider: string | null; legs: TrackRow[]; start: string; end: string;
};

const minutesUntil = (day: string, time: string, now: Now) => diffDays(day, now.day) * 1440 + (toMin(time) - toMin(now.time));
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** O trecho já saiu? Sem horário, só no dia seguinte. */
export const departed = (r: TrackRow, now: Now) => (r.time ? minutesUntil(r.date, r.time, now) <= 0 : r.date < now.day);

/** Trechos de voo de uma venda em viagens: cada viagem começa num trecho e acaba no que volta à origem. */
function chain(legs: TrackRow[]): TrackRow[][] {
  const out: TrackRow[][] = [];
  let cur: TrackRow[] = [];
  for (const l of [...legs].sort(byWhen)) {
    cur.push(l);
    if (cur.length > 1 && l.to && l.to === cur[0]!.from) { out.push(cur); cur = []; }
  }
  if (cur.length) out.push(cur);
  return out;
}
const closes = (t: TrackRow[]) => t.length > 1 && !!t.at(-1)!.to && t.at(-1)!.to === t[0]!.from;
const sameClient = (a: TrackRow, b: TrackRow) => a.customers.some((c) => b.customers.some((d) => d.id === c.id));

/**
 * Quem está viajando agora, embarca em até 48h ou volta hoje. A ida e a volta emitidas separadas (em vendas
 * diferentes, comum nas emissões com milhas) viram uma viagem só quando são do mesmo cliente e a volta sai de
 * onde a ida chegou e volta para onde ela saiu. Hospedagem e cruzeiro em andamento entram quando o cliente não
 * tem voo no mapa.
 */
export function mapTrips(items: TrackItem[], now: Now): Trip[] {
  const flights = items.filter((i) => i.kind === "FLIGHT").flatMap(rowsOf);
  const bySale = new Map<string, TrackRow[]>();
  for (const r of flights) bySale.set(r.saleId, [...(bySale.get(r.saleId) ?? []), r]);
  let chains = [...bySale.values()].flatMap(chain);
  // junta ida e volta de vendas diferentes
  const open = chains.filter((c) => !closes(c)).sort((a, b) => byWhen(a[0]!, b[0]!));
  const used = new Set<TrackRow[]>();
  for (const a of open) {
    if (used.has(a)) continue;
    const last = a.at(-1)!;
    const back = open.find((b) => b !== a && !used.has(b) && b[0]!.saleId !== a[0]!.saleId && byWhen(b[0]!, last) > 0
      && b[0]!.from === last.to && b.at(-1)!.to === a[0]!.from && sameClient(a[0]!, b[0]!));
    if (back) { used.add(a); used.add(back); chains.push([...a, ...back]); }
  }
  chains = chains.filter((c) => !used.has(c) || closes(c));

  const trips: Trip[] = [];
  for (const legs of chains) {
    const first = legs[0]!, last = legs.at(-1)!;
    const round = closes(legs);
    let status: MapStatus | null = null, at: string | null = null;
    if (!departed(first, now)) {
      if (minutesUntil(first.date, first.time ?? "00:00", now) <= 48 * 60) { status = "boarding"; at = first.from; }
    } else if (round && last.date === now.day) {
      status = "returning"; at = last.from;
    } else if (round ? last.date > now.day : last.date === now.day) {
      const flown = legs.filter((l) => departed(l, now));
      status = "traveling"; at = flown.at(-1)?.to ?? first.to;
    }
    if (!status) continue;
    const ids = [...new Set(legs.map((l) => l.saleId))];
    const customers = [...new Map(legs.flatMap((l) => l.customers).map((c) => [c.id, c])).values()];
    trips.push({
      id: `trip:${first.id}`, status, at, kind: "FLIGHT", saleIds: ids, customers, passengers: first.passengers,
      reservation: [...new Set(legs.map((l) => l.reservation).filter(Boolean))].join(" · ") || null,
      provider: [...new Set(legs.map((l) => l.provider).filter(Boolean))].join(" · ") || null, legs, start: first.date, end: last.date,
    });
  }

  // hospedagem e cruzeiro, para quem não tem voo no mapa
  const onMap = new Set(trips.flatMap((t) => t.customers.map((c) => c.id)));
  const salesOnMap = new Set(trips.flatMap((t) => t.saleIds));
  for (const i of items) {
    if (i.kind !== "HOTEL" && i.kind !== "CRUISE") continue;
    const r = rowsOf(i)[0];
    if (!r || salesOnMap.has(r.saleId) || r.customers.some((c) => onMap.has(c.id))) continue;
    let status: MapStatus | null = null;
    if (r.date <= now.day && lastDay(r) >= now.day && (r.date < now.day || departed(r, now) || i.kind === "HOTEL")) status = "traveling";
    else if (i.kind === "CRUISE" && minutesUntil(r.date, r.time ?? "00:00", now) <= 48 * 60 && r.date >= now.day) status = "boarding";
    if (!status) continue;
    trips.push({
      id: `trip:${r.id}`, status, at: r.place, kind: i.kind, saleIds: [r.saleId], customers: r.customers, passengers: r.passengers,
      reservation: r.reservation, provider: r.provider, legs: [r], start: r.date, end: lastDay(r),
    });
    for (const c of r.customers) onMap.add(c.id);
  }
  return trips.sort((a, b) => a.status.localeCompare(b.status) || a.start.localeCompare(b.start) || a.id.localeCompare(b.id));
}

/** Clientes ativos no mapa: os clientes das viagens (viagem sem cliente cadastrado conta como um). */
export function activeClients(trips: Trip[]) {
  const ids = new Set<string>();
  let anon = 0;
  for (const t of trips) {
    if (!t.customers.length) anon++;
    for (const c of t.customers) ids.add(c.id);
  }
  return ids.size + anon;
}

/** Horário de Brasília (sem horário de verão): o dia e a hora HH:MM. */
export function brNow(at = new Date()): Now {
  const iso = new Date(at.getTime() - 3 * 3_600_000).toISOString();
  return { day: iso.slice(0, 10), time: iso.slice(11, 16) };
}
