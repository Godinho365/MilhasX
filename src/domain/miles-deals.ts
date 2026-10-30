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

export type Passenger = { name: string; cpf: string; birthDate: string; email?: string; phone?: string };
