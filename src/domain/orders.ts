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

const CABINS: Record<string, string> = { ECONOMY: "Econômica", PREMIUM: "Premium Economy", BUSINESS: "Executiva", FIRST: "Primeira classe" };
const br = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "data a definir");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** O que o cliente pediu, em linhas para mensagem: trechos com datas, passageiros, classe e preferências. */
export function orderSummary(o: { segments: Segment[]; tripType: TripType | string; adults: number; children: number; infants: number; cabin: string; flexibleDates?: boolean; checkedBag?: boolean }) {
  const s = o.segments;
  const legs =
    o.tripType === "ROUND_TRIP" && s.length >= 2
      ? [`${s[0]!.origin} → ${s[0]!.destination} · ida ${br(s[0]!.date)} · volta ${br(s[1]!.date)}`]
      : s.map((x, i) => `${s.length > 1 ? `Trecho ${i + 1}: ` : ""}${x.origin} → ${x.destination} · ${br(x.date)}`);
  const pax = [plural(o.adults, "adulto", "adultos"), o.children ? plural(o.children, "criança", "crianças") : "", o.infants ? plural(o.infants, "bebê", "bebês") : ""].filter(Boolean).join(", ");
  const prefs = [o.flexibleDates && "datas flexíveis", o.checkedBag && "com bagagem despachada"].filter(Boolean).join(" · ");
  return [...legs.map((l) => `✈️ ${l}`), `👥 ${pax} · ${CABINS[o.cabin] ?? o.cabin}`, prefs ? `📝 ${prefs}` : ""].filter(Boolean).join("\n");
}

/**
 * Mensagens de WhatsApp do pedido. {nome}: primeiro nome; {rota}: rota curta; {pedido}: o que o cliente
 * pediu (orderSummary); {link}: a página do cliente indicada em `page` (cotação ou reserva).
 */
export const WHATSAPP_TEMPLATES = [
  { key: "cotacao", label: "Enviar cotação", page: "cotacao", text: "Olá, {nome}! Tudo bem? Preparei a cotação da sua viagem:\n\n{pedido}\n\nVoos, valores e condições aqui: {link}\n(Para abrir, use os 4 últimos dígitos do seu telefone.)\n\nQualquer dúvida, estou à disposição." },
  { key: "documentos", label: "Pedir documentos", page: null, text: "Olá, {nome}! Para seguir com a emissão da sua viagem:\n\n{pedido}\n\npreciso do nome completo, data de nascimento e documento de cada passageiro." },
  { key: "emitido", label: "Avisar emissão", page: "reserva", text: "Olá, {nome}! Sua passagem {rota} foi emitida. Localizador, voos e documentos aqui: {link}\n(Para abrir, use os 4 últimos dígitos do seu telefone.)\n\nBoa viagem!" },
] as const;

export function whatsappText(template: string, order: { customerName: string; route: string; summary?: string; link?: string | null }) {
  let t = template;
  // Sem link (página pública ainda não criada), tira a linha do link e o aviso dos dígitos
  if (!order.link) t = t.replace(/[^\n]*\{link\}[^\n]*(\n\(Para abrir[^\n]*\))?/, "").replace(/\n{3,}/g, "\n\n");
  return t
    .replaceAll("{nome}", order.customerName.split(/\s+/)[0] ?? "")
    .replaceAll("{rota}", order.route)
    .replaceAll("{pedido}", order.summary ?? order.route)
    .replaceAll("{link}", order.link ?? "")
    .trim();
}

/** Link wa.me com o telefone só em dígitos (com DDI 55 quando vier com DDD). */
export function whatsappLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const full = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
}
