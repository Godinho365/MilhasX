// Catálogo do cadastro de cartões: bancos, bandeiras e categorias, situação, benefícios e lembretes.

export const BANKS = [
  "Agibank", "Ame", "American Express", "Banco do Brasil", "Banco Pan", "Banrisul", "Bradesco", "BRB", "BTG Pactual", "BV", "C6 Bank", "Caixa",
  "Credicard", "Digio", "Genial", "Inter", "Itaú", "Mercado Pago", "Neon", "Next", "Nubank", "Original", "PagBank", "Porto Bank", "Safra",
  "Santander", "Sicoob", "Sicredi", "Will Bank", "XP", "Outros",
];

/** Bandeiras e as categorias de cada uma (do básico ao topo de linha). */
export const BRANDS: Record<string, string[]> = {
  Visa: ["Classic", "Gold", "Platinum", "Signature", "Infinite", "Infinite Privilege", "Business", "Corporate"],
  Mastercard: ["Standard", "Gold", "Platinum", "Black", "Business", "Corporate"],
  "American Express": ["Green", "Gold", "Platinum", "Centurion"],
  Elo: ["Mais", "Grafite", "Nanquim", "Diners Club"],
  Hipercard: ["Nacional", "Internacional", "Gold", "Platinum"],
  "Diners Club": ["Clássico", "Premium"],
  Discover: ["Clássico"],
  Outros: [],
};

export const MODALITIES = { CREDIT: "Crédito", DEBIT: "Débito", MULTIPLE: "Múltiplo", PREPAID: "Pré-pago", CORPORATE: "Corporativo" } as const;
export const CARD_TYPES = { HOLDER: "Titular", ADDITIONAL: "Adicional" } as const;
export const CARD_STATUS = { ACTIVE: "Ativo", BLOCKED: "Bloqueado", CANCELED: "Cancelado", EXPIRED: "Vencido" } as const;
export type CardStatus = keyof typeof CARD_STATUS;

/** Benefícios marcáveis, por grupo (servem também de filtro na lista de cartões). */
export const BENEFITS: Record<string, string[]> = {
  "Salas VIP": ["Priority Pass", "LoungeKey", "Mastercard Black Lounge", "Amex The Lounge", "DragonPass", "Visa Airport Companion"],
  Seguros: ["Seguro viagem", "Seguro bagagem", "Seguro cancelamento de viagem", "Seguro carro alugado", "Garantia estendida", "Proteção de compra"],
  "Pontos e milhas": ["Livelo", "Esfera", "LATAM Pass", "Smiles", "Azul Fidelidade", "TAP Miles&Go", "ALL Accor", "Membership Rewards", "C6 Átomos"],
  "Concierge e estilo de vida": ["Concierge 24h", "Mastercard Surpreenda/Priceless", "Visa Infinite Concierge", "Status em rede hoteleira"],
  "Câmbio e exterior": ["IOF reduzido", "Débito internacional", "Saque no exterior sem taxa", "Conta global multimoeda"],
  "Cashback e descontos": ["Cashback", "Desconto em delivery", "Desconto em mobilidade", "Streaming"],
  "Eventos e experiências": ["Pré-venda de shows", "Ingressos VIP", "Restaurantes"],
  Outros: ["Cartão adicional grátis", "Anuidade grátis"],
};
export const ALL_BENEFITS = Object.values(BENEFITS).flat();

/** Lembretes rápidos: o título e a data sugeridos saem dos dados do cartão. */
export const REMINDER_KINDS = { DUE: "Vencimento da fatura", CLOSING: "Fechamento da fatura", ANNUAL_FEE: "Anuidade", EXPIRY: "Vencimento do cartão", BENEFIT: "Renovação de benefício", CUSTOM: "Personalizado" } as const;
export type ReminderKind = keyof typeof REMINDER_KINDS;
export const REMINDER_RECURRENCE = { NONE: "Sem recorrência", MONTHLY: "Mensal", YEARLY: "Anual" } as const;
export type ReminderRecurrence = keyof typeof REMINDER_RECURRENCE;

/** Próxima data (AAAA-MM-DD) em que cai o dia do mês informado, a partir de hoje. */
export function nextDayOfMonth(day: number, today: string) {
  const [y, m, d] = today.split("-").map(Number);
  const fit = (yy: number, mm: number) => Math.min(day, new Date(Date.UTC(yy, mm, 0)).getUTCDate());
  let yy = y!, mm = m!;
  if (fit(yy, mm) < d!) { mm += 1; if (mm > 12) { mm = 1; yy += 1; } }
  return `${yy}-${String(mm).padStart(2, "0")}-${String(fit(yy, mm)).padStart(2, "0")}`;
}

/** Sugestão de título e data do lembrete rápido a partir do cartão. */
export function quickReminder(kind: ReminderKind, card: { name: string; dueDay: number; closingDay: number; annualFeeMonth: number | null; expMonth: number | null; expYear: number | null }, today: string) {
  const title = `${REMINDER_KINDS[kind]} · ${card.name}`;
  if (kind === "DUE") return { title, date: nextDayOfMonth(card.dueDay, today), recurrence: "MONTHLY" as const, advanceDays: 3 };
  if (kind === "CLOSING") return { title, date: nextDayOfMonth(card.closingDay, today), recurrence: "MONTHLY" as const, advanceDays: 1 };
  if (kind === "ANNUAL_FEE" && card.annualFeeMonth) {
    const y = Number(today.slice(0, 4));
    const d = `${y}-${String(card.annualFeeMonth).padStart(2, "0")}-01`;
    return { title, date: d >= today ? d : `${y + 1}${d.slice(4)}`, recurrence: "YEARLY" as const, advanceDays: 15 };
  }
  if (kind === "EXPIRY" && card.expMonth && card.expYear) {
    const last = new Date(Date.UTC(card.expYear, card.expMonth, 0)).getUTCDate();
    return { title, date: `${card.expYear}-${String(card.expMonth).padStart(2, "0")}-${last}`, recurrence: "NONE" as const, advanceDays: 30 };
  }
  return { title: kind === "CUSTOM" ? "" : title, date: today, recurrence: "NONE" as const, advanceDays: kind === "BENEFIT" ? 7 : 0 };
}

/** Avança um lembrete recorrente para a próxima data (mês curto fica no último dia). */
export function nextReminderDate(date: string, r: ReminderRecurrence) {
  if (r === "NONE") return null;
  const [y, m, d] = date.split("-").map(Number);
  const months = r === "MONTHLY" ? 1 : 12;
  const t = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), Math.min(d!, last))).toISOString().slice(0, 10);
}
