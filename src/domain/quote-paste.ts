// Comparador: lê o que o usuário cola (link da busca e/ou texto copiado da página de resultados)
// para preencher a cotação. O link traz só a busca (programa, trecho, datas, passageiros e classe);
// milhas, taxas e preço só existem no texto da página, que muda conforme o site — por isso o texto
// vira uma lista de opções para o usuário escolher, e não um valor adivinhado.

import { PROGRAM_BY_KEY, type Cabin, type SearchParams } from "./flight-search";

export type PastedLink = { program: string | null; params: Partial<SearchParams> };
export type PastedOffer = { miles: number | null; taxesCents: number | null; cashCents: number | null };

const IATA = /^[A-Z]{3}$/;
const iata = (v: string | null | undefined) => (v && IATA.test(v.toUpperCase()) ? v.toUpperCase() : undefined);
const count = (v: string | null | undefined) => (v != null && /^\d$/.test(v) ? Number(v) : undefined);
const isoDay = (v: string | null | undefined) => (v && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : undefined);
const msDay = (v: string | null | undefined) => (v && /^\d{10,}$/.test(v) ? new Date(Number(v)).toISOString().slice(0, 10) : undefined);
const mdyDay = (v: string | null | undefined) => {
  const x = v?.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return x ? `${x[3]}-${x[1]}-${x[2]}` : undefined;
};
const cabinOf = (v: string | null | undefined): Cabin | undefined => {
  const s = v?.toUpperCase() ?? "";
  if (s.startsWith("BUSINESS") || s === "EXECUTIVA") return "BUSINESS";
  if (s.startsWith("ECONOM")) return "ECONOMY";
  return undefined;
};
const clean = (p: Partial<SearchParams>) => Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined)) as Partial<SearchParams>;

// Sites sem leitura dos parâmetros: só reconhece o programa
const HOSTS: [RegExp, string][] = [
  [/azulpelomundo\.voeazul/, "azul-mundo"],
  [/voeazul\.com\.br/, "azul"],
  [/smiles\.com\.br/, "smiles"],
  [/iberia\.com/, "iberia"],
  [/aa\.com/, "aadvantage"],
  [/copaair\.com/, "connectmiles"],
  [/united\.com/, "mileageplus"],
  [/aircanada\.com/, "aeroplan"],
  [/miles-and-more\.com/, "miles-and-more"],
  [/qatarairways\.com/, "qatar"],
  [/virginatlantic\.com/, "virgin"],
  [/britishairways\.com/, "british"],
  [/airfrance\./, "flying-blue"],
  [/flytap\.com/, "tap"],
  [/lifemiles\.com/, "lifemiles"],
  [/qantas\.com/, "qantas"],
  [/voegol\.com\.br/, "gol-cash"],
  [/decolar\.com/, "decolar"],
  [/skyscanner\./, "skyscanner"],
];

/** Primeiro link de busca de um programa conhecido no texto colado. */
export function parseSearchLink(text: string): PastedLink | null {
  for (const raw of text.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
    let u: URL;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    const sp = u.searchParams;
    if (/latamairlines\.com/.test(u.hostname)) {
      const inbound = isoDay(sp.get("inbound"));
      return {
        program: sp.get("redemption") === "false" ? "latam-cash" : "latam",
        params: clean({ origin: iata(sp.get("origin")), destination: iata(sp.get("destination")), departDate: isoDay(sp.get("outbound")), returnDate: inbound ?? (sp.get("trip") === "OW" ? null : undefined), adults: count(sp.get("adt")), children: count(sp.get("chd")), infants: count(sp.get("inf")), cabin: cabinOf(sp.get("cabin")) }),
      };
    }
    if (/smiles\.com\.br/.test(u.hostname)) {
      return {
        program: "smiles",
        params: clean({ origin: iata(sp.get("originAirport")), destination: iata(sp.get("destinationAirport")), departDate: msDay(sp.get("departureDate")), returnDate: sp.get("tripType") === "2" ? null : msDay(sp.get("returnDate")), adults: count(sp.get("adults")), children: count(sp.get("children")), infants: count(sp.get("infants")), cabin: cabinOf(sp.get("cabin")) }),
      };
    }
    if (/azulpelomundo\.voeazul/.test(u.hostname)) {
      // /flights/RT/BSB/SDU/-/-/2027-05-29/2027-05-30/1/0/0/0/0/ALL/F/ECONOMY/...
      const s = u.pathname.split("/").filter(Boolean);
      if (s[0] === "flights") return { program: "azul-mundo", params: clean({ origin: iata(s[2]), destination: iata(s[3]), departDate: isoDay(s[6]), returnDate: s[1] === "OW" ? null : isoDay(s[7]), adults: count(s[8]), children: count(s[9]), infants: count(s[10]), cabin: cabinOf(s[15]) }) };
    }
    if (/voeazul\.com\.br/.test(u.hostname) && sp.get("c[0].ds")) {
      return { program: "azul", params: clean({ origin: iata(sp.get("c[0].ds")), destination: iata(sp.get("c[0].as")), departDate: mdyDay(sp.get("c[0].std")), returnDate: sp.get("c[1].std") ? mdyDay(sp.get("c[1].std")) : null }) };
    }
    const host = HOSTS.find(([re]) => re.test(u.hostname));
    if (host && PROGRAM_BY_KEY[host[1]]) return { program: host[1], params: {} };
  }
  return null;
}

const NUM = String.raw`\d{1,3}(?:[.\s ]\d{3})+|\d{3,7}`;
const BRL = String.raw`(?:R\$|BRL)\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})`;
const toInt = (s: string) => Number(s.replace(/\D/g, ""));
const toCents = (s: string) => Number(s.replace(/\./g, "").replace(",", ""));

// LATAM, depois de escolher ida e volta: "Selecione a opção que preferir para pagar sua passagem:"
// seguido das combinações do total (milhas + dinheiro). Os valores de cada trecho, acima dela, não servem.
const PAY_OPTIONS = /selecione a op[çc][ãa]o que preferir para pagar/i;

// Opções na ordem em que aparecem no texto (já com espaços normalizados)
function scan(flat: string, cash: boolean): PastedOffer[] {
  const out: PastedOffer[] = [];
  if (!cash) {
    const re = new RegExp(String.raw`(${NUM})\s*(?:milhas|pontos|pts|miles|points)\b`, "gi");
    for (const m of flat.matchAll(re)) {
      const miles = toInt(m[1]!);
      if (miles < 1000) continue;
      // Taxas: o primeiro R$ logo depois (mesmo cartão de voo)
      const after = flat.slice(m.index! + m[0].length, m.index! + m[0].length + 80);
      const t = after.match(new RegExp(BRL, "i"));
      out.push({ miles, taxesCents: t ? toCents(t[1]!) : null, cashCents: null });
    }
  }
  if (cash || out.length === 0) {
    for (const m of flat.matchAll(new RegExp(BRL, "gi"))) {
      const cents = toCents(m[1]!);
      if (cents >= 5000) out.push({ miles: null, taxesCents: null, cashCents: cents });
    }
  }
  return out;
}

// Só a seção de opções de pagamento, quando o texto tem uma
function section(text: string) {
  const flat = text.replace(/\s+/g, " ");
  const at = flat.search(PAY_OPTIONS);
  return at >= 0 ? { flat: flat.slice(at), pay: true } : { flat, pay: false };
}

/**
 * Opções de preço no texto copiado da página de resultados: "41.000 milhas + R$ 97,17" (LATAM: "BRL 97,17"),
 * "37.746 pontos ... Taxas R$ 97,17" ou, em página em dinheiro, só "R$ 794,17".
 * Da mais barata para a mais cara, sem repetidas.
 */
export function parseOffers(text: string, cash = false): PastedOffer[] {
  const seen = new Set<string>();
  return scan(section(text).flat, cash)
    .filter((o) => {
      const k = `${o.miles}|${o.taxesCents}|${o.cashCents}`;
      return !seen.has(k) && !!seen.add(k);
    })
    .sort((a, b) => (a.miles ?? 0) - (b.miles ?? 0) || (a.cashCents ?? 0) - (b.cashCents ?? 0) || (a.taxesCents ?? 0) - (b.taxesCents ?? 0))
    .slice(0, 12);
}

// Smiles, depois de escolher os voos: o total da seleção vem logo antes de "1 pessoa adulta"
const SMILES_TOTAL = new RegExp(String.raw`(${NUM})\s*milhas\s*\+\s*${BRL}\s*\d+\s*pessoas?\s*adultas?`, "i");

/**
 * A opção a usar sem perguntar: o total da seleção da Smiles ("59.700 milhas + R$ 97,17 · 1 pessoa adulta")
 * ou a primeira das opções de pagamento da LATAM (a de mais milhas e menos dinheiro).
 */
export function preferredOffer(text: string, cash = false): PastedOffer | null {
  if (!cash) {
    const t = text.replace(/\s+/g, " ").match(SMILES_TOTAL);
    if (t) return { miles: toInt(t[1]!), taxesCents: toCents(t[2]!), cashCents: null };
  }
  const s = section(text);
  return s.pay ? scan(s.flat, cash)[0] ?? null : null;
}
