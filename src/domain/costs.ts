// Tipos de custo e campos de detalhe por categoria (ver docs/novo-lancamento.md).
import type { EntryType } from "./ledger";

export const COST_LABELS = {
  PONTOS: "Pontos",
  IOF: "IOF",
  OUTROS: "Outros",
  FRETE: "Frete",
  MARKUP: "Markup",
  MENSALIDADE: "Mensalidade",
  ANUIDADE: "Anuidade",
  TAXA_EMBARQUE: "Taxa de embarque",
  COMPLETAR_PONTOS: "Completar pontos",
} as const;
export type CostType = keyof typeof COST_LABELS;
export const COST_TYPES = Object.keys(COST_LABELS) as CostType[];

/** Tipos de custo aceitos em cada categoria; o primeiro é o padrão sugerido. */
export const COSTS_BY_TYPE: Partial<Record<EntryType, CostType[]>> = {
  PURCHASE: ["PONTOS", "IOF", "OUTROS"],
  CARD: ["ANUIDADE", "IOF", "OUTROS"],
  PARTNER_PURCHASE: ["OUTROS", "FRETE", "MARKUP", "IOF"],
  CLUB: ["MENSALIDADE", "IOF", "OUTROS"],
  FLIGHT: ["OUTROS", "IOF"],
  HOTEL: ["OUTROS", "IOF"],
  BONUS: ["OUTROS", "IOF"],
  OTHER_CREDIT: ["OUTROS", "IOF"],
  INITIAL_BALANCE: ["OUTROS", "ANUIDADE"],
  FLIGHT_REDEMPTION: ["TAXA_EMBARQUE", "COMPLETAR_PONTOS", "OUTROS"],
  CAR_RENTAL: ["COMPLETAR_PONTOS", "OUTROS"],
  HOTEL_REDEMPTION: ["COMPLETAR_PONTOS", "OUTROS"],
  PRODUCT_REDEMPTION: ["COMPLETAR_PONTOS", "OUTROS"],
  OTHER_DEBIT: ["COMPLETAR_PONTOS", "OUTROS"],
};

export const costTypesFor = (t: EntryType) => COSTS_BY_TYPE[t] ?? [];

/** Campos da seção "Mais informações" de cada resgate. */
export type DetailField = "cashReference" | "passengers" | "reservation" | "origin" | "destination" | "description" | "startDate" | "endDate";
export const DETAILS_BY_TYPE: Partial<Record<EntryType, { subtitle: string; fields: DetailField[]; startLabel?: string; endLabel?: string }>> = {
  FLIGHT_REDEMPTION: { subtitle: "Passageiros, reserva, trecho e datas", fields: ["cashReference", "passengers", "reservation", "origin", "destination", "description", "startDate", "endDate"], startLabel: "Data de ida", endLabel: "Data de volta" },
  CAR_RENTAL: { subtitle: "Reserva e período da locação", fields: ["cashReference", "description", "reservation", "startDate", "endDate"], startLabel: "Data de retirada", endLabel: "Data de devolução" },
  HOTEL_REDEMPTION: { subtitle: "Reserva e período da hospedagem", fields: ["cashReference", "description", "reservation", "startDate", "endDate"], startLabel: "Data de entrada", endLabel: "Data de saída" },
  PRODUCT_REDEMPTION: { subtitle: "Descrição e outras informações", fields: ["cashReference", "description"] },
  OTHER_DEBIT: { subtitle: "Descrição e outras informações", fields: ["cashReference", "description"] },
};

/** Valor obtido por milheiro num resgate: referência em dinheiro (menos o que foi pago) ÷ pontos × 1000. */
export function redemptionValueCpm(cashReferenceCents: number, paidCents: number, points: number) {
  if (points <= 0 || cashReferenceCents <= 0) return null;
  return Math.round(((cashReferenceCents - paidCents) * 1000) / points);
}
