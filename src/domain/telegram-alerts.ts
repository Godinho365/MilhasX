// Alertas do Chat Balcões. Dois jeitos, que podem ir juntos no mesmo alerta:
// - pelo pedido de compra: programa, até quantos CPFs, faixa de milhas e milheiro (CPM) mínimo;
// - por palavras: a mensagem tem todas elas (maiúsculas e acentos não importam). Para "uma ou outra", dois alertas.
import { normalizeText, parseBalcaoAd, type BalcaoAd, type BalcaoProgram } from "./balcao-ads";

export { normalizeText };

export type AlertRule = {
  id: string;
  name: string;
  words: string[];
  active: boolean;
  program?: string | null; // vazio = qualquer programa
  maxCpfs?: number | null; // pedido de até N CPFs (sem a quantidade no anúncio, conta 1)
  minMiles?: number | null;
  maxMiles?: number | null;
  minCpmCents?: number | null; // milheiro oferecido de pelo menos
};

const brl = (cents: number) => `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const thousands = (n: number) => (n % 1000 === 0 ? `${n / 1000}k` : n.toLocaleString("pt-BR"));

/** O que o alerta pede, em uma linha: "Smiles · até 2 CPFs · 100k a 300k milhas · CPM a partir de R$ 16,00 · "urgente"". */
export function describeAlert(a: Omit<AlertRule, "id" | "name" | "active">) {
  const miles = a.minMiles != null && a.maxMiles != null ? `${thousands(a.minMiles)} a ${thousands(a.maxMiles)} milhas`
    : a.minMiles != null ? `a partir de ${thousands(a.minMiles)} milhas`
    : a.maxMiles != null ? `até ${thousands(a.maxMiles)} milhas` : null;
  return [
    a.program,
    a.maxCpfs != null ? `até ${a.maxCpfs} ${a.maxCpfs === 1 ? "CPF" : "CPFs"}` : null,
    miles,
    a.minCpmCents != null ? `CPM a partir de ${brl(a.minCpmCents)}` : null,
    a.words.length ? a.words.map((w) => `"${w}"`).join(" + ") : null,
  ].filter(Boolean).join(" · ");
}

/** O alerta olha o pedido de compra (programa, CPFs, milhas ou milheiro)? */
export const hasAdCriteria = (a: AlertRule) => !!a.program || a.maxCpfs != null || a.minMiles != null || a.maxMiles != null || a.minCpmCents != null;

/** Palavras do alerta digitadas separadas por vírgula (ou por linha): sem vazias e sem repetir (maiúsculas e
 *  acentos não contam como diferença), até 10. */
export function parseAlertWords(raw: string) {
  const seen = new Set<string>();
  return raw.split(/[,;\n]/).map((w) => w.trim()).filter((w) => {
    const k = normalizeText(w);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  }).slice(0, 10);
}

/** O pedido de compra atende o alerta? Sem milheiro no anúncio, não passa num milheiro mínimo. */
function adFits(a: AlertRule, ad: BalcaoAd | null) {
  if (!ad || ad.kind !== "COMPRA") return false;
  if (a.program && ad.program !== (a.program as BalcaoProgram)) return false;
  if (a.maxCpfs != null && (ad.cpfs ?? 1) > a.maxCpfs) return false;
  if (a.minMiles != null && ad.miles < a.minMiles) return false;
  if (a.maxMiles != null && ad.miles > a.maxMiles) return false;
  if (a.minCpmCents != null && (ad.cpmCents == null || ad.cpmCents < a.minCpmCents)) return false;
  return true;
}

/** Nomes dos alertas (ativos) que a mensagem dispara. */
export function matchAlerts(text: string, alerts: AlertRule[], ad: BalcaoAd | null = parseBalcaoAd(text)) {
  const t = normalizeText(text);
  return alerts
    .filter((a) => {
      if (!a.active) return false;
      const byAd = hasAdCriteria(a);
      if (!byAd && !a.words.length) return false;
      if (byAd && !adFits(a, ad)) return false;
      return a.words.every((w) => t.includes(normalizeText(w)));
    })
    .map((a) => a.name);
}
