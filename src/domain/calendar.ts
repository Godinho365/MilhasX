// Calendário da agência: os tipos de evento, as datas (dias "AAAA-MM-DD", horário "HH:MM" de Brasília), a repetição
// dos eventos, os aniversários e o arquivo .ics (importar de outra agenda e o link para o Google Agenda assinar).
// Sem banco (testável).

export const EVENT_KINDS = {
  CHECKIN: { label: "Check-in", color: "#06b6d4" },
  BOARDING: { label: "Embarque", color: "#3b82f6" },
  HOTEL: { label: "Hospedagem", color: "#8b5cf6" },
  CAR: { label: "Aluguel de carro", color: "#f97316" },
  TOUR: { label: "Passeios e serviços", color: "#14b8a6" },
  FOLLOWUP: { label: "Follow-up", color: "#eab308" },
  TASK: { label: "Tarefa", color: "#64748b" },
  BIRTHDAY: { label: "Aniversariante", color: "#ec4899" },
  PASSPORT: { label: "Passaporte", color: "#6366f1" },
  VISA: { label: "Visto", color: "#84cc16" },
  REMINDER: { label: "Lembrete", color: "#f43f5e" },
  FINANCE: { label: "Vencimento", color: "#22c55e" },
} as const;
export type EventKind = keyof typeof EVENT_KINDS;
export const EVENT_KIND_KEYS = Object.keys(EVENT_KINDS) as EventKind[];
/** Os que se criam à mão no calendário (tarefa vira uma tarefa de verdade; vencimento vem do Financeiro). */
export const MANUAL_KINDS = EVENT_KIND_KEYS.filter((k) => k !== "TASK" && k !== "FINANCE");

export const RECURRENCES = { NONE: "Não repete", WEEKLY: "Toda semana", MONTHLY: "Todo mês", YEARLY: "Todo ano" } as const;
export type Recurrence = keyof typeof RECURRENCES;

/** De onde vem o evento: criado aqui, importado, ou lido de outra parte do sistema (só leitura aqui). */
export type EventSource = "MANUAL" | "IMPORT" | "SALE" | "TASK" | "PASSENGER" | "HOLDER" | "FINANCE" | "CARD";

/** Evento como o calendário mostra (uma ocorrência: o evento que repete aparece uma vez por data). */
export type CalEvent = {
  id: string; // único na tela: "ev:<id>:<data>", "sale:<item>:dep", ...
  eventId: string | null; // o evento gravado (criado ou importado), para editar
  seriesDate: string | null; // a data em que o evento gravado começa (no que repete, a 1ª ocorrência)
  kind: EventKind;
  title: string;
  date: string; // AAAA-MM-DD
  endDate: string | null; // último dia (eventos de vários dias, como hospedagem)
  time: string | null; // HH:MM (vazio = o dia todo)
  endTime: string | null;
  source: EventSource;
  href: string | null; // onde abrir (a venda, a tarefa...)
  editable: boolean;
  memberIds: string[]; // responsáveis (para "Minhas")
  customer: { id: string; name: string } | null;
  location: string | null;
  notes: string | null;
  detail: string | null; // linha extra: passageiros, localizador, valor...
  recurrence: Recurrence;
  remind: boolean;
  done: boolean; // tarefa concluída
};

/* ---------------- Datas ---------------- */

const DAY = 86_400_000;
export const isDay = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
export const isTime = (s: unknown): s is string => typeof s === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const utc = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const dayOf = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => dayOf(new Date(utc(d) + n * DAY));
export const diffDays = (a: string, b: string) => Math.round((utc(a) - utc(b)) / DAY);
/** Dia da semana (0 = domingo). */
export const weekday = (d: string) => new Date(utc(d)).getUTCDay();
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** O mesmo dia em outro mês (31 de jan + 1 mês = 28/29 de fev). */
export function addMonths(d: string, n: number) {
  const [y, m, dd] = d.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  return dayOf(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(dd, lastDayOfMonth(t.getUTCFullYear(), t.getUTCMonth())))));
}

/** Quantos dias antes do voo o check-in costuma abrir (o lembrete sai nesse dia). */
export const CHECKIN_DAYS_BEFORE = 2;

/**
 * As datas de início das ocorrências que tocam o intervalo [from, to] (um evento de vários dias aparece se qualquer
 * dia dele cair no intervalo). Sem repetição: a própria data, se tocar. No máximo 400 ocorrências.
 */
export function occurrences(ev: { date: string; endDate?: string | null; recurrence?: Recurrence }, from: string, to: string): string[] {
  const span = ev.endDate && ev.endDate > ev.date ? diffDays(ev.endDate, ev.date) : 0;
  const hits = (start: string) => start <= to && addDays(start, span) >= from;
  const rec = ev.recurrence ?? "NONE";
  if (rec === "NONE") return hits(ev.date) ? [ev.date] : [];
  const out: string[] = [];
  // começa perto do intervalo, sem andar desde o início do evento
  const behind = Math.max(0, diffDays(from, ev.date) - span);
  let k = rec === "WEEKLY" ? Math.floor(behind / 7) : rec === "MONTHLY" ? Math.max(0, Math.floor(behind / 31) - 1) : Math.max(0, Math.floor(behind / 366) - 1);
  for (let guard = 0; guard < 2000 && out.length < 400; guard++, k++) {
    const start = rec === "WEEKLY" ? addDays(ev.date, 7 * k) : addMonths(ev.date, rec === "MONTHLY" ? k : 12 * k);
    if (start > to) break;
    if (hits(start)) out.push(start);
  }
  return out;
}

/** Aniversários no intervalo: a data de cada ano e a idade que a pessoa faz. */
export function birthdays(birthDate: string, from: string, to: string) {
  return occurrences({ date: birthDate, recurrence: "YEARLY" }, from, to)
    .filter((d) => d > birthDate)
    .map((d) => ({ date: d, age: Number(d.slice(0, 4)) - Number(birthDate.slice(0, 4)) }));
}

/** O intervalo que cada visão mostra: o mês (6 semanas, de domingo a sábado), a semana, o dia ou 30 dias (lista). */
export type CalView = "mes" | "semana" | "dia" | "lista";
export function viewRange(view: CalView, anchor: string) {
  if (view === "dia") return { from: anchor, to: anchor };
  if (view === "lista") return { from: anchor, to: addDays(anchor, 29) };
  if (view === "semana") { const from = addDays(anchor, -weekday(anchor)); return { from, to: addDays(from, 6) }; }
  const first = `${anchor.slice(0, 7)}-01`;
  const from = addDays(first, -weekday(first));
  return { from, to: addDays(from, 41) };
}
/** O passo das setas: um mês, uma semana, um dia ou 30 dias. */
export const stepAnchor = (view: CalView, anchor: string, dir: 1 | -1) =>
  view === "mes" ? addMonths(`${anchor.slice(0, 7)}-01`, dir) : addDays(anchor, dir * (view === "semana" ? 7 : view === "dia" ? 1 : 30));

/** Ordem na tela: por dia; no mesmo dia, os do dia todo antes, depois pelo horário. */
export const byStart = (a: Pick<CalEvent, "date" | "time" | "title">, b: Pick<CalEvent, "date" | "time" | "title">) =>
  a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? "") || a.title.localeCompare(b.title, "pt-BR");

/* ---------------- .ics (iCalendar) ---------------- */

export type IcsEvent = { uid: string; title: string; date: string; endDate: string | null; time: string | null; endTime: string | null; location: string | null; notes: string | null; recurrence: Recurrence };

const unescapeText = (v: string) => v.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1").trim();
const brParts = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** "20261112", "20261112T090000" (horário local) ou "20261112T120000Z" (UTC, convertido para Brasília). */
function icsDate(value: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, , z] = m;
  if (!h) return isDay(`${y}-${mo}-${d}`) ? { date: `${y}-${mo}-${d}`, time: null } : null;
  if (!z) return { date: `${y}-${mo}-${d}`, time: `${h}:${mi}` };
  const t = new Date(Date.UTC(+y!, +mo! - 1, +d!, +h, +mi!));
  if (Number.isNaN(t.getTime())) return null;
  const p = Object.fromEntries(brParts.formatToParts(t).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

/** Lê os eventos de um arquivo .ics (exportado do Google Agenda, Outlook, Apple...). No máximo `max`. */
export function parseIcs(text: string, max = 2000): IcsEvent[] {
  // linhas dobradas: a continuação começa com espaço ou tab
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n[ \t]/g, "").split("\n");
  const out: IcsEvent[] = [];
  let cur: Record<string, { value: string; params: string }> | null = null;
  let depth = 0; // VALARM e outros blocos dentro do evento
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "BEGIN:VEVENT") { cur = {}; depth = 0; continue; }
    if (!cur) continue;
    if (line.startsWith("BEGIN:")) { depth++; continue; }
    if (line.startsWith("END:") && line !== "END:VEVENT") { depth = Math.max(0, depth - 1); continue; }
    if (line === "END:VEVENT") {
      const ev = toEvent(cur);
      if (ev) out.push(ev);
      cur = null;
      if (out.length >= max) break;
      continue;
    }
    if (depth) continue;
    const colon = line.indexOf(":");
    if (colon < 1) continue;
    const head = line.slice(0, colon);
    const [name, ...params] = head.split(";");
    const key = name!.toUpperCase();
    if (!(key in cur)) cur[key] = { value: line.slice(colon + 1), params: params.join(";").toUpperCase() };
  }
  return out;
}

function toEvent(p: Record<string, { value: string; params: string }>): IcsEvent | null {
  if (p.STATUS?.value.trim().toUpperCase() === "CANCELLED") return null;
  const start = p.DTSTART ? icsDate(p.DTSTART.value) : null;
  if (!start) return null;
  let endDate: string | null = null, endTime: string | null = null;
  const end = p.DTEND ? icsDate(p.DTEND.value) : null;
  if (end) {
    if (!start.time && !end.time) {
      const last = addDays(end.date, -1); // no dia todo, o fim é exclusivo
      if (last > start.date) endDate = last;
    } else if (start.time) {
      if (end.date > start.date) endDate = end.date;
      endTime = end.time;
    }
  }
  const rule = p.RRULE?.value.toUpperCase() ?? "";
  const freq = /FREQ=(WEEKLY|MONTHLY|YEARLY)/.exec(rule)?.[1] as Recurrence | undefined;
  const simple = freq && !/INTERVAL=(?!1(;|$))/.test(rule) && !/BYSETPOS|BYWEEKNO|BYYEARDAY/.test(rule);
  const title = unescapeText(p.SUMMARY?.value ?? "").slice(0, 200) || "(sem título)";
  return {
    uid: (p.UID?.value.trim() || `${start.date}-${start.time ?? ""}-${title}`).slice(0, 200),
    title, date: start.date, endDate, time: start.time, endTime,
    location: p.LOCATION ? unescapeText(p.LOCATION.value).slice(0, 200) || null : null,
    notes: p.DESCRIPTION ? unescapeText(p.DESCRIPTION.value).slice(0, 2000) || null : null,
    recurrence: simple ? freq! : "NONE",
  };
}

const escapeText = (v: string) => v.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
/** Dobra a linha a cada 73 caracteres (o limite do formato é 75 bytes; acentos ocupam mais). */
function fold(line: string) {
  const out: string[] = [];
  let rest = line;
  while (Buffer.byteLength(rest, "utf8") > 73) {
    let n = Math.min(rest.length, 73);
    while (n > 1 && Buffer.byteLength(rest.slice(0, n), "utf8") > 73) n--;
    out.push(rest.slice(0, n));
    rest = rest.slice(n);
  }
  out.push(rest);
  return out.join("\r\n ");
}
const compact = (d: string) => d.replace(/-/g, "");
/** Horário de Brasília (UTC−3, sem horário de verão) em UTC: "20261112T120000Z". */
function utcStamp(d: string, t: string) {
  const [h, m] = t.split(":").map(Number) as [number, number];
  const x = new Date(utc(d) + (h + 3) * 3_600_000 + m * 60_000);
  return `${x.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
}

/** O calendário em .ics (para o Google Agenda assinar pelo link). */
export function toIcs(events: CalEvent[], name: string, now = new Date()) {
  const stamp = `${now.toISOString().slice(0, 19).replace(/[-:]/g, "")}Z`;
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//MilhasX//Calendario//PT-BR", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(name)}`, "X-WR-TIMEZONE:America/Sao_Paulo", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H",
  ];
  for (const e of events) {
    const label = EVENT_KINDS[e.kind].label;
    const desc = [label, e.detail, e.customer?.name, e.notes].filter(Boolean).join("\n");
    lines.push("BEGIN:VEVENT", `UID:${e.id.replace(/[^A-Za-z0-9:._-]/g, "-")}@milhasx`, `DTSTAMP:${stamp}`);
    if (e.time) {
      const endDay = e.endDate ?? e.date;
      const endTime = e.endTime ?? (e.endDate ? e.time : null);
      lines.push(`DTSTART:${utcStamp(e.date, e.time)}`);
      lines.push(endTime ? `DTEND:${utcStamp(endDay, endTime)}` : "DURATION:PT1H");
    } else {
      lines.push(`DTSTART;VALUE=DATE:${compact(e.date)}`, `DTEND;VALUE=DATE:${compact(addDays(e.endDate ?? e.date, 1))}`);
    }
    lines.push(`SUMMARY:${escapeText(e.title)}`, `CATEGORIES:${escapeText(label)}`);
    if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
    if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
