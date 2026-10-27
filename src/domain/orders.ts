// CRM de pedidos de emissão: etapas do Kanban (as mesmas colunas do Quero Milhas).
export const ORDER_STAGES = ["NEW", "QUOTING", "QUOTE_SENT", "NEGOTIATION", "ISSUED", "TRAVELING", "DONE"] as const;
export type OrderStageKey = (typeof ORDER_STAGES)[number];
export const STAGE_LABELS: Record<OrderStageKey, string> = {
  NEW: "Novos pedidos",
  QUOTING: "Pesquisa e Cotação",
  QUOTE_SENT: "Cotação enviada",
  NEGOTIATION: "Negociação e emissão",
  ISSUED: "Emitido",
  TRAVELING: "Viagem em curso",
  DONE: "Viagem concluída",
};
export const TRIP_LABELS = { ONE_WAY: "Somente ida", ROUND_TRIP: "Ida e volta", MULTI: "Múltiplos trechos" } as const;
export type TripType = keyof typeof TRIP_LABELS;
export const PRIORITY_LABELS = { LOW: "Baixa", MEDIUM: "Média", HIGH: "Alta" } as const;
export type Priority = keyof typeof PRIORITY_LABELS;
export const ARCHIVE_REASONS = ["Cliente desistiu", "Fechou com outro", "Preço alto", "Sem disponibilidade", "Sem resposta", "Duplicado", "Outro"] as const;

export type Segment = { origin: string; destination: string; date: string | null };

/** "BSB → RIO · 23/01/2027" */
export function routeLabel(segments: Segment[], tripType: TripType) {
  if (!segments.length) return "";
  const first = segments[0]!;
  const date = first.date ? ` · ${first.date.slice(8, 10)}/${first.date.slice(5, 7)}/${first.date.slice(0, 4)}` : "";
  if (tripType === "MULTI" && segments.length > 1) return `${segments.map((s) => s.origin).join(" → ")} → ${segments.at(-1)!.destination}${date}`;
  return `${first.origin} ${tripType === "ROUND_TRIP" ? "⇄" : "→"} ${first.destination}${date}`;
}

/** Texto de WhatsApp: {nome} vira o primeiro nome do cliente. */
export const WHATSAPP_TEMPLATES = [
  { key: "cotacao", label: "Enviar cotação", text: "Olá, {nome}! Tudo bem? Seguem as opções que encontrei para a sua viagem {rota}. Qualquer dúvida, estou à disposição." },
  { key: "documentos", label: "Pedir documentos", text: "Olá, {nome}! Para seguir com a emissão {rota}, preciso do nome completo, data de nascimento e documento de cada passageiro." },
  { key: "emitido", label: "Avisar emissão", text: "Olá, {nome}! Sua passagem {rota} foi emitida. Enviei o localizador e os detalhes por aqui. Boa viagem!" },
] as const;

export function whatsappText(template: string, order: { customerName: string; route: string }) {
  return template.replaceAll("{nome}", order.customerName.split(/\s+/)[0] ?? "").replaceAll("{rota}", order.route);
}

/** Link wa.me com o telefone só em dígitos (com DDI 55 quando vier com DDD). */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
