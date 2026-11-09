// Anúncios dos grupos de balcão: "COMPRO 197,6K SMILES / 1 CPF / 15", "LATAM / 79.644 / 3 cpf / R$ 25,00"...
// Tira o programa, a quantidade de milhas, os CPFs e o milheiro (CPM). Contraproposta (só um número, "24,5 conta
// própria"), mensagem do bot do grupo e compra de crédito não são anúncio: sem programa e quantidade, não é.

/** Texto para comparar: minúsculo e sem acentos. */
export const normalizeText = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export const BALCAO_PROGRAMS = ["LATAM", "Smiles", "Azul", "AAdvantage", "TAP", "Avios", "Flying Blue", "Copa", "Livelo", "Esfera"] as const;
export type BalcaoProgram = (typeof BALCAO_PROGRAMS)[number];

/** Como cada programa aparece escrito (texto já minúsculo e sem acentos). */
const PROGRAM_WORDS: [BalcaoProgram, RegExp][] = [
  ["LATAM", /\blatam\b|\bmultiplus\b/],
  ["Smiles", /\bsmiles\b|\bgol\b/],
  ["Azul", /\bazul\b|\btudo ?azul\b/],
  ["AAdvantage", /\baa\b|\baadvantage\b|\bamerican\b/],
  ["TAP", /\btap\b|miles ?& ?go/],
  ["Avios", /\bavios\b|\biberia\b|\bbritish\b|\bqatar\b/],
  ["Flying Blue", /flying ?blue|\bair ?france\b|\bklm\b/],
  ["Copa", /\bcopa\b|connect ?miles/],
  ["Livelo", /\blivelo\b/],
  ["Esfera", /\besfera\b/],
];

export type BalcaoAd = {
  kind: "COMPRA" | "VENDA";
  program: BalcaoProgram;
  miles: number;
  cpfs: number | null; // sem a quantidade, o anúncio costuma ser de 1 CPF
  cpmCents: number | null; // milheiro oferecido; sem preço, o anúncio pede propostas
};

/** "25,25" / "15.5" / "17" → centavos. Ponto ou vírgula com 1 ou 2 casas é decimal. */
function money(raw: string) {
  const v = Number(raw.replace(",", "."));
  return Number.isFinite(v) ? Math.round(v * 100) : null;
}

/** Quantidade de milhas: "197,6k" / "169 K" → milhares; "79.644" (ponto de milhar) ou "79644" → o número. */
function findMiles(t: string): { miles: number; at: string } | null {
  const k = t.match(/(\d{1,4}(?:[.,]\d{1,3})?)\s*k\b/);
  if (k) return { miles: Math.round(Number(k[1]!.replace(",", ".")) * 1000), at: k[0] };
  const sep = t.match(/(?<![\d.,])\d{1,3}(?:\.\d{3})+(?![\d,])/);
  if (sep) return { miles: Number(sep[0].replace(/\./g, "")), at: sep[0] };
  const plain = t.match(/(?<![\d.,/])\d{4,7}(?![\d.,/])/);
  if (plain) return { miles: Number(plain[0]), at: plain[0] };
  return null;
}

/** Milheiro: o valor com "R$" ou "reais"; senão, o último número que sobrou (tirando milhas, CPFs e datas). */
function findCpm(rest: string) {
  const tagged = rest.match(/r\$\s*:?\s*(\d{1,3}(?:[.,]\d{1,2})?)(?![\d])/) ?? rest.match(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:reais|real)\b/);
  const raw = tagged?.[1] ?? [...rest.matchAll(/(?<![\d.,])(\d{1,3}(?:[.,]\d{1,2})?)(?![\d.,]|\s*%)/g)].at(-1)?.[1];
  const cents = raw ? money(raw) : null;
  return cents != null && cents >= 100 && cents <= 50_000 ? cents : null;
}

/** Milheiro de uma contraproposta ("24,5", "17,00", "24?75", "95 voo próximo", "R$ 105,00, e comigo..."), em
 *  centavos; null quando a mensagem é um pedido ou não traz um valor que pareça milheiro. */
export function parseCounterOffer(text: string) {
  if (parseBalcaoAd(text)) return null;
  const t = normalizeText(text);
  const m = t.match(/(?<![\d.,])(\d{1,3})(?:[.,?](\d{1,2}))?(?![\d]|[.,]\d)/);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, "0")) : 0);
  return cents >= 100 && cents <= 50_000 ? cents : null;
}

/** O anúncio da mensagem, ou null quando não é anúncio (contraproposta, conversa, bot, crédito...). */
export function parseBalcaoAd(text: string): BalcaoAd | null {
  const t = normalizeText(text).replace(/\s+/g, " ").trim();
  if (!t || /\bcreditos?\b|negociacao registrada|\bemitido (para|por)\b/.test(t)) return null;
  const program = PROGRAM_WORDS.find(([, re]) => re.test(t))?.[0];
  if (!program) return null;
  const m = findMiles(t);
  if (!m || m.miles < 1000) return null;
  const cpf = t.match(/(?<![\d.,])(\d{1,2})\s*(?:cpfs?|pax|passageiros?|pessoas?)\b/);
  const rest = t.replace(m.at, " ").replace(cpf?.[0] ?? "\u0000", " ").replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, " ");
  return {
    kind: /\bvendo\b|\bvenda\b/.test(t) && !/\bcompro\b|\bc>/.test(t) ? "VENDA" : "COMPRA",
    program,
    miles: m.miles,
    cpfs: cpf ? Number(cpf[1]) : null,
    cpmCents: findCpm(rest),
  };
}
