// Tipos de item da venda e os campos de viagem de cada um (rótulos do formulário e dos acompanhamentos).

export const SALE_ITEM_KINDS = ["FLIGHT", "BAGGAGE", "SEAT", "HOTEL", "CAR", "TRANSFER", "CRUISE", "INSURANCE", "OTHER"] as const;
export type SaleItemKind = (typeof SALE_ITEM_KINDS)[number];
export const SALE_ITEM_LABELS: Record<SaleItemKind, string> = {
  FLIGHT: "Passagem aérea",
  BAGGAGE: "Bagagem",
  SEAT: "Assento",
  HOTEL: "Hospedagem",
  CAR: "Aluguel de carro",
  TRANSFER: "Transfer",
  CRUISE: "Cruzeiro",
  INSURANCE: "Seguro viagem",
  OTHER: "Outro",
};
export const isSaleItemKind = (k: string): k is SaleItemKind => (SALE_ITEM_KINDS as readonly string[]).includes(k);

/**
 * Campos de viagem do item. Com rota (voo, bagagem, assento): origem → destino, ida e volta. Sem rota: um lugar
 * (guardado no destino, um código de aeroporto/cidade) e o começo e o fim. `done` é a marcação do acompanhamento
 * (no voo, uma para a ida e outra para a volta).
 */
export type ItemFields = { route: boolean; place: string; start: string; end: string; provider: string; providerHint: string; times: boolean; done: string; section: string; sectionHint: string };
export const ITEM_FIELDS: Record<SaleItemKind, ItemFields> = {
  FLIGHT: { route: true, place: "Destino", start: "Ida", end: "Volta", provider: "Companhia aérea", providerHint: "Ex.: LATAM, GOL, Azul, TAP", times: true, done: "Check-in feito", section: "Viagem", sectionHint: "Trecho, datas e companhia" },
  BAGGAGE: { route: true, place: "Destino", start: "Ida", end: "Volta", provider: "Companhia aérea", providerHint: "Ex.: LATAM, GOL, Azul", times: false, done: "Confirmado", section: "Viagem", sectionHint: "Trecho e datas" },
  SEAT: { route: true, place: "Destino", start: "Ida", end: "Volta", provider: "Companhia aérea", providerHint: "Ex.: LATAM, GOL, Azul", times: false, done: "Confirmado", section: "Viagem", sectionHint: "Trecho e datas" },
  HOTEL: { route: false, place: "Cidade", start: "Entrada", end: "Saída", provider: "Hotel", providerHint: "Nome do hotel", times: false, done: "Reserva confirmada", section: "Hospedagem", sectionHint: "Hotel, cidade, entrada e saída" },
  CAR: { route: false, place: "Cidade", start: "Retirada", end: "Devolução", provider: "Locadora", providerHint: "Ex.: Localiza, Movida, Hertz", times: true, done: "Reserva confirmada", section: "Locação", sectionHint: "Locadora, cidade, retirada e devolução" },
  TRANSFER: { route: false, place: "Cidade", start: "Ida", end: "Volta", provider: "Empresa", providerHint: "Quem faz o transfer", times: true, done: "Confirmado", section: "Transfer", sectionHint: "Empresa, cidade e horários" },
  CRUISE: { route: false, place: "Porto de embarque", start: "Embarque", end: "Desembarque", provider: "Navio ou companhia", providerHint: "Ex.: MSC Seaview", times: true, done: "Check-in feito", section: "Cruzeiro", sectionHint: "Navio, porto, embarque e desembarque" },
  INSURANCE: { route: false, place: "Destino", start: "Início da vigência", end: "Fim da vigência", provider: "Seguradora", providerHint: "Ex.: Assist Card, GTA", times: false, done: "Apólice enviada", section: "Seguro", sectionHint: "Seguradora, destino e vigência" },
  OTHER: { route: false, place: "Cidade", start: "Data", end: "Até", provider: "Fornecedor", providerHint: "Quem presta o serviço", times: true, done: "Confirmado", section: "Serviço", sectionHint: "Fornecedor, cidade e data" },
};
export const itemFields = (k: string) => ITEM_FIELDS[isSaleItemKind(k) ? k : "OTHER"];
