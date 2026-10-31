// Lê o texto da tela de resultados da LATAM (copiado, digitado ou tirado de um print por OCR) para o
// primeiro passo do CRM Milhas: trecho, datas, passageiros, classe, milhas e taxas, e monta o link da
// busca. O link reproduz a PESQUISA (a tarifa escolhida fica na sessão da LATAM) e, em milhas, pede login.
// A tela não mostra o ano: ele sai do dia da semana ("seg. 30 nov") ou, sem ele, da próxima data futura.

import { PROGRAM_BY_KEY, type Cabin, type SearchParams } from "./flight-search";
import { offersInOrder, preferredOffer } from "./quote-paste";

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type LatamScreen = {
  params: Partial<SearchParams>;
  dates: { day: number; month: number; weekday: number | null }[];
  yearGuessed: boolean; // sem dia da semana: ano pela próxima data futura
  passengersShown: boolean; // a tela mostrava "N Passageiros"
  pointsPerPax: number | null;
  taxesPerPaxCents: number | null;
  points: number | null; // total: por passageiro × passageiros
  taxesCents: number | null;
  link: string | null; // busca na LATAM (só com origem, destino e ida)
};

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** Ano da data: o primeiro (a partir de hoje) em que o dia da semana bate; sem dia da semana, a próxima ocorrência. */
function yearFor(day: number, month: number, weekday: number | null, today: Date) {
  const base = today.getUTCFullYear();
  const start = Date.UTC(base, today.getUTCMonth(), today.getUTCDate());
  for (let y = base; y <= base + 6; y++) {
    const t = Date.UTC(y, month, day);
    if (new Date(t).getUTCDate() !== day) continue; // 29/02 em ano comum
    if (t < start) continue;
    if (weekday == null || new Date(t).getUTCDay() === weekday) return y;
  }
  return Date.UTC(base, month, day) >= start ? base : base + 1;
}

export function parseLatamScreen(text: string, today = new Date()): LatamScreen | null {
  const flat = text.replace(/\s+/g, " ");
  const f = fold(flat);

  // Trecho: códigos IATA logo depois do horário ("7:55 CNF ... 10:10 POA")
  const codes = [...flat.matchAll(/\b\d{1,2}[:h]\d{2}\s*([A-Z]{3})\b/g)].map((m) => m[1]!);
  const origin = codes[0];
  const destination = codes.find((c) => c !== origin);
  // Volta: um trecho que sai do destino para a origem
  const legs: [string, string][] = [];
  for (let i = 0; i + 1 < codes.length; i += 2) legs.push([codes[i]!, codes[i + 1]!]);
  const hasReturn = !!origin && !!destination && legs.some(([a, b]) => a === destination && b === origin);

  // Datas: "seg. 30 nov", "seg., 30 de nov.", "26 de nov" — sem repetir a mesma data
  const dates: LatamScreen["dates"] = [];
  const re = new RegExp(String.raw`(?:\b(${WEEKDAYS.join("|")})\w*\.?,?\s*)?\b(\d{1,2})\s*(?:de\s*)?(${MONTHS.join("|")})\w*\b`, "g");
  for (const m of f.matchAll(re)) {
    const d = { day: Number(m[2]), month: MONTHS.indexOf(m[3]!), weekday: m[1] ? WEEKDAYS.indexOf(m[1]) : null };
    if (d.day < 1 || d.day > 31) continue;
    const same = dates.find((x) => x.day === d.day && x.month === d.month);
    if (same) same.weekday ??= d.weekday;
    else dates.push(d);
  }
  const iso = dates.map((d) => ymd(yearFor(d.day, d.month, d.weekday, today), d.month, d.day));
  const departDate = iso[0];
  const returnDate = hasReturn || (codes.length === 0 && iso.length > 1) ? iso[1] ?? null : null;

  const pax = f.match(/\b(\d)\s*passageiros?\b/);
  const adults = pax ? Number(pax[1]) : null;
  const cabin: Cabin | undefined = /\b(business|executiva)\b/.test(f) ? "BUSINESS" : /\bpremium\b/.test(f) ? "PREMIUM" : /\b(economy|economica)\b/.test(f) ? "ECONOMY" : undefined;

  // Preço por passageiro: a soma dos trechos ("Preço por passageiro" de cada um, os primeiros valores da
  // tela), que é a 1ª opção de pagamento; o cabeçalho das opções costuma sair ilegível no OCR. Sem os
  // trechos completos, a 1ª opção de pagamento ou o primeiro valor.
  const nLegs = Math.max(1, legs.length);
  const inOrder = offersInOrder(text);
  const legPrices = inOrder.slice(0, nLegs);
  let per = legPrices.length === nLegs && legPrices.every((o) => o.miles && o.taxesCents != null)
    ? { miles: legPrices.reduce((t, o) => t + o.miles!, 0), taxesCents: legPrices.reduce((t, o) => t + o.taxesCents!, 0), cashCents: null }
    : preferredOffer(text) ?? inOrder[0] ?? null;
  if (!origin && !departDate && !per?.miles) return null;

  const n = adults ?? 1;
  const params: Partial<SearchParams> = Object.fromEntries(Object.entries({ origin, destination, departDate, returnDate: departDate ? returnDate : undefined, adults: adults ?? undefined, cabin }).filter(([, v]) => v !== undefined));
  const link = origin && destination && departDate
    ? PROGRAM_BY_KEY.latam!.build({ origin, destination, departDate, returnDate, adults: n, children: 0, infants: 0, cabin: cabin ?? "ECONOMY" })
    : null;
  return {
    params,
    dates,
    yearGuessed: dates.some((d) => d.weekday == null),
    passengersShown: adults != null,
    pointsPerPax: per?.miles ?? null,
    taxesPerPaxCents: per?.taxesCents ?? null,
    points: per?.miles ? per.miles * n : null,
    taxesCents: per?.taxesCents != null ? per.taxesCents * n : null,
    link,
  };
}
