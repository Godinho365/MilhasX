// CRM Milhas: etapas da negociação de venda de milhas e tipos de comprador.

export const DEAL_STAGES = ["NEW", "NEGOTIATION", "AWAITING", "ISSUED", "PAID"] as const;
export type DealStageKey = (typeof DEAL_STAGES)[number];
export const DEAL_STAGE_LABELS: Record<DealStageKey, string> = {
  NEW: "Novo interesse",
  NEGOTIATION: "Negociação",
  AWAITING: "Aguardando dados / emissão",
  ISSUED: "Emitido",
  PAID: "Pago",
};

export const BUYER_TYPES = ["AGENCY", "BALCAO", "FINAL"] as const;
export type BuyerType = (typeof BUYER_TYPES)[number];
export const BUYER_LABELS: Record<BuyerType, string> = { AGENCY: "Agência / revendedor", BALCAO: "Balcão / plataforma", FINAL: "Cliente final" };

/** Balcões que já vêm na lista ao criar a negociação. */
export const DEFAULT_BALCOES = ["Balcão de Milhas ASM", "Balcão Milhas VIP", "Balcão MilhasX"];

/** Balcões para escolher: os que já vêm na lista e os usados nas negociações (um balcão novo entra na lista
 *  quando a negociação é salva), sem repetir, em ordem alfabética. */
export function balcaoOptions(usedNames: string[]) {
  return [...new Set([...DEFAULT_BALCOES, ...usedNames].map((n) => n.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** Palavras do nome, minúsculas e sem acentos ("BALCÃO Milhas VIP - Pro" → ["balcao", "milhas", "vip", "pro"]). */
const nameWords = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

/** Balcão da negociação vinda de um grupo do Telegram: o da lista (padrões e já usados) cujo nome está inteiro no
 *  nome do grupo, o mais completo ("BALCÃO MILHAS VIP PRO" → "Balcão Milhas VIP"); nome de uma palavra só
 *  ("balcao") não vale. Sem nenhum, o nome do grupo. */
export function balcaoForGroup(groupTitle: string, usedNames: string[]) {
  const g = ` ${nameWords(groupTitle).join(" ")} `;
  const match = balcaoOptions(usedNames)
    .map((b) => ({ b, w: nameWords(b) }))
    .filter(({ w }) => w.length >= 2 && g.includes(` ${w.join(" ")} `))
    .sort((x, y) => y.w.length - x.w.length)[0];
  return match?.b ?? groupTitle.trim();
}

/** Valor da venda: pontos pelo preço do milheiro. */
export const dealTotalCents = (points: number | null, saleCpmCents: number | null) => (points && saleCpmCents ? Math.round((points * saleCpmCents) / 1000) : null);

/** Lucro estimado: diferença entre o milheiro de venda e o custo médio da conta. */
export const dealProfitCents = (points: number | null, saleCpmCents: number | null, costCpmCents: number | null) =>
  points && saleCpmCents && costCpmCents != null ? Math.round((points * (saleCpmCents - costCpmCents)) / 1000) : null;

/** Valor cobrado do comprador: pontos pelo milheiro + taxas da emissão (pagas por mim e repassadas). */
export const dealChargeCents = (points: number | null, saleCpmCents: number | null, taxesCents: number | null) => {
  const miles = dealTotalCents(points, saleCpmCents);
  return miles == null ? (taxesCents ?? null) : miles + (taxesCents ?? 0);
};

/** CPFs que a emissão usa: o combinado ou os passageiros informados (o maior); sem nenhum, 1,
 *  porque toda emissão usa ao menos um CPF. Vale para a venda, o limite de CPFs da conta e o lucro por CPF. */
export const dealCpfs = (d: { passengers: number | null; passengersData: unknown }) =>
  Math.max(d.passengers ?? 0, Array.isArray(d.passengersData) ? d.passengersData.length : 0, 1);

export type DealPaste = { orderLink?: string; points?: number; passengers?: number; taxesCents?: number };

/**
 * Lê o que o comprador manda para a emissão, por exemplo:
 * "https://www.latamairlines.com/br/pt/v2/passageiros?orderId=… 8.673K 1CPF Taxas: R$35,75".
 * "8.673K", "8,7K" e "12K" são milhares (8.673, 8.700 e 12.000); "8.673 milhas" também vale.
 */
export function parseDealPaste(text: string): DealPaste {
  const out: DealPaste = {};
  const url = text.match(/https?:\/\/[^\s"'<>]+/);
  if (url) out.orderLink = url[0];
  const rest = text.replace(/https?:\/\/[^\s"'<>]+/g, " ");
  const k = rest.match(/(\d+(?:[.,]\d+)?)\s*k\b/i);
  const miles = rest.match(/(\d{1,3}(?:\.\d{3})+|\d{3,})\s*(?:milhas|pontos|pts|miles)\b/i);
  if (k) out.points = Math.round(Number(k[1]!.replace(",", ".")) * 1000);
  else if (miles) out.points = Number(miles[1]!.replace(/\D/g, ""));
  const cpf = rest.match(/(\d{1,2})\s*(?:cpfs?|passageiros?|pax)\b/i);
  if (cpf) out.passengers = Number(cpf[1]);
  const tax = rest.match(/taxas?\s*:?\s*(?:R\$|BRL)?\s*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:,\d{2})?)/i);
  if (tax) out.taxesCents = Math.round(Number(tax[1]!.replace(/\./g, "").replace(",", ".")) * 100);
  return out;
}

export type Passenger = { name: string; firstName?: string; lastName?: string; cpf: string; birthDate: string; gender?: "M" | "F" | ""; email?: string; phone?: string };

/** Passageiros colados de uma conversa (WhatsApp/Telegram): um bloco por passageiro, separado por linha em
 *  branco (ou, sem linhas em branco, um novo bloco a cada CPF). Reconhece CPF, data (DD/MM/AAAA), e-mail,
 *  telefone e sexo; o nome é a linha que sobra (ou a que vem depois de "Nome:"). */
export function parsePassengersText(text: string): Passenger[] {
  const cpfRe = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const blocks: string[][] = [];
  let cur: string[] = [];
  const flush = () => { if (cur.some(Boolean)) blocks.push(cur.filter(Boolean)); cur = []; };
  for (const l of lines) {
    if (!l) { flush(); continue; }
    // sem linha em branco entre passageiros: um segundo CPF começa outro bloco
    if (cpfRe.test(l) && cur.some((x) => cpfRe.test(x))) {
      const nameLine = cur.length && !/\d/.test(cur[cur.length - 1]!) ? cur.pop()! : null;
      flush();
      if (nameLine) cur.push(nameLine);
    }
    cur.push(l);
  }
  flush();
  return blocks
    .map((b) => {
      const all = b.join("\n");
      const cpf = all.match(cpfRe)?.[0].replace(/\D/g, "") ?? "";
      const d = all.match(/\b(\d{2})[/.-](\d{2})[/.-](\d{4})\b/);
      const email = all.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? "";
      const phoneLine = b.find((l) => /(tel|cel|fone|whats|contato)/i.test(l)) ?? b.find((l) => !cpfRe.test(l) && /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/.test(l) && !/\d{2}[/.-]\d{2}[/.-]\d{4}/.test(l));
      const phone = phoneLine?.match(/\+?\(?\d[\d\s().-]{8,}\d/)?.[0].trim() ?? "";
      const gender = /\b(feminino|fem|mulher|sexo:?\s*f)\b/i.test(all) ? "F" : /\b(masculino|masc|homem|sexo:?\s*m)\b/i.test(all) ? "M" : "";
      const labeled = b.map((l) => l.match(/^nome(?:\s+completo)?\s*[:\-]\s*(.+)$/i)?.[1]).find(Boolean);
      const label = /^(cpf|nasc|data|e-?mail|tel|cel|fone|whats|sexo|g[eê]nero|contato)/i;
      const free = b.find((l) => !label.test(l) && !/\d/.test(l) && !/@/.test(l) && !/^(masculino|feminino)$/i.test(l));
      const name = (labeled ?? free ?? "").replace(/^\W+/, "").trim();
      return { name, cpf, birthDate: d ? `${d[3]}-${d[2]}-${d[1]}` : "", gender: gender as Passenger["gender"], email, phone };
    })
    .filter((p) => p.cpf || p.birthDate); // sem CPF nem data não é passageiro (ex.: "bom dia, segue os dados")
}
