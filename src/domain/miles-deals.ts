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
