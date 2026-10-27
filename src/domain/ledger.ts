// Regras do extrato: saldo e custo médio ponderado por conta.
// Função pura: recebe todos os lançamentos de um usuário e recalcula tudo do zero (replay),
// o que mantém extrato e saldos sempre consistentes, inclusive após editar/excluir.

export type EntryType =
  | "INITIAL_BALANCE"
  | "PURCHASE"
  | "CARD"
  | "PARTNER_PURCHASE"
  | "CLUB"
  | "FLIGHT"
  | "HOTEL"
  | "BONUS"
  | "OTHER_CREDIT"
  | "TRANSFER_IN"
  | "TRANSFER_BONUS"
  | "TRANSFER_OUT"
  | "SALE"
  | "FLIGHT_REDEMPTION"
  | "CAR_RENTAL"
  | "HOTEL_REDEMPTION"
  | "PRODUCT_REDEMPTION"
  | "EXPIRATION"
  | "OTHER_DEBIT";

/** Créditos que o usuário lança manualmente (ordem do formulário). */
export const MANUAL_CREDIT_TYPES = [
  "PURCHASE",
  "CARD",
  "PARTNER_PURCHASE",
  "CLUB",
  "FLIGHT",
  "HOTEL",
  "BONUS",
  "OTHER_CREDIT",
  "INITIAL_BALANCE",
] as const satisfies readonly EntryType[];

/** Débitos que o usuário lança manualmente (ordem do formulário). */
export const MANUAL_DEBIT_TYPES = [
  "FLIGHT_REDEMPTION",
  "CAR_RENTAL",
  "HOTEL_REDEMPTION",
  "PRODUCT_REDEMPTION",
  "OTHER_DEBIT",
  "EXPIRATION",
] as const satisfies readonly EntryType[];

export const CREDIT_TYPES: EntryType[] = [...MANUAL_CREDIT_TYPES, "TRANSFER_IN", "TRANSFER_BONUS"];
export const DEBIT_TYPES: EntryType[] = [...MANUAL_DEBIT_TYPES, "TRANSFER_OUT", "SALE"];

export const ENTRY_LABELS: Record<EntryType, string> = {
  INITIAL_BALANCE: "Saldo inicial",
  PURCHASE: "Compra de pontos",
  CARD: "Pontos cartão de crédito",
  PARTNER_PURCHASE: "Compra em parceiro",
  CLUB: "Pontos de clube",
  FLIGHT: "Pontos de voo",
  HOTEL: "Pontos de hotel",
  BONUS: "Bônus de pontos",
  OTHER_CREDIT: "Outros créditos",
  TRANSFER_IN: "Transferência (entrada)",
  TRANSFER_BONUS: "Bônus de transferência",
  TRANSFER_OUT: "Transferência (saída)",
  SALE: "Venda",
  FLIGHT_REDEMPTION: "Emissão de passagem",
  CAR_RENTAL: "Aluguel de veículo",
  HOTEL_REDEMPTION: "Reserva de hotel",
  PRODUCT_REDEMPTION: "Resgate de produto",
  EXPIRATION: "Expiração de pontos",
  OTHER_DEBIT: "Outros resgates",
};

/** Categorias de crédito em que normalmente há dinheiro envolvido (o formulário pede o custo). */
export const COSTED_TYPES: EntryType[] = ["PURCHASE", "PARTNER_PURCHASE", "CLUB", "OTHER_CREDIT", "INITIAL_BALANCE"];

export interface LedgerEntry {
  id: string;
  accountId: string;
  type: EntryType;
  status: "CONFIRMED" | "PENDING";
  points: number; // sinalizado
  inputCostCents: number;
  occurredAt: Date;
  createdAt: Date;
  groupId: string | null;
  priorityPoints?: number | null;
  priorityCostCents?: number | null;
}

export interface AccountState {
  balance: number;
  costCents: number;
  investedCents: number;
  pendingPoints: number;
}

export type ReplayResult =
  | { ok: true; entryCosts: Map<string, number>; accounts: Map<string, AccountState> }
  | { ok: false; erro: string; entryId: string };

export function isCredit(type: EntryType) {
  return CREDIT_TYPES.includes(type);
}

// Débitos de um grupo vêm antes dos créditos (a transferência precisa do custo da origem)
function legOrder(e: LedgerEntry) {
  return e.points < 0 ? 0 : 1;
}

export function sortForReplay(entries: LedgerEntry[]): LedgerEntry[] {
  return [...entries].sort(
    (a, b) =>
      a.occurredAt.getTime() - b.occurredAt.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      (a.groupId ?? "").localeCompare(b.groupId ?? "") ||
      legOrder(a) - legOrder(b) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * Regras de transferência:
 * - O débito na origem remove custo proporcional ao CPM médio. Se houver pontos comprados no carrinho
 *   marcados como prioritários (priorityPoints/priorityCostCents), eles saem primeiro pelo custo de compra.
 * - O custo levado + taxas da transferência (inputCostCents das pernas de entrada) é dividido entre
 *   entrada e bônus na proporção dos pontos; a última perna recebe o resto do arredondamento.
 * - Pernas de entrada pendentes (entrega futura) já têm o custo calculado, mas só entram no saldo quando confirmadas.
 */
export function replayLedger(entries: LedgerEntry[]): ReplayResult {
  const accounts = new Map<string, AccountState>();
  const entryCosts = new Map<string, number>();
  const groupCost = new Map<string, number>();
  const groupCreditPoints = new Map<string, number>();
  const groupFees = new Map<string, number>();
  const groupCreditAssigned = new Map<string, { points: number; cost: number }>();

  const state = (id: string) => {
    let s = accounts.get(id);
    if (!s) {
      s = { balance: 0, costCents: 0, investedCents: 0, pendingPoints: 0 };
      accounts.set(id, s);
    }
    return s;
  };
  const isTransferCredit = (e: LedgerEntry) => !!e.groupId && (e.type === "TRANSFER_IN" || e.type === "TRANSFER_BONUS");

  for (const e of entries) {
    state(e.accountId);
    if (isTransferCredit(e)) {
      groupCreditPoints.set(e.groupId!, (groupCreditPoints.get(e.groupId!) ?? 0) + e.points);
      groupFees.set(e.groupId!, (groupFees.get(e.groupId!) ?? 0) + e.inputCostCents);
    }
  }

  for (const e of sortForReplay(entries)) {
    const s = state(e.accountId);
    if (e.points === 0 || !Number.isInteger(e.points)) {
      return { ok: false, erro: "Quantidade de pontos inválida", entryId: e.id };
    }
    if (isCredit(e.type) !== e.points > 0) {
      return { ok: false, erro: "Sinal dos pontos não corresponde ao tipo", entryId: e.id };
    }

    if (isTransferCredit(e)) {
      const g = e.groupId!;
      const total = groupCreditPoints.get(g) ?? e.points;
      const totalCost = (groupCost.get(g) ?? 0) + (groupFees.get(g) ?? 0);
      const done = groupCreditAssigned.get(g) ?? { points: 0, cost: 0 };
      const isLast = done.points + e.points >= total;
      const cost = isLast ? totalCost - done.cost : Math.round((totalCost * e.points) / total);
      groupCreditAssigned.set(g, { points: done.points + e.points, cost: done.cost + cost });
      entryCosts.set(e.id, cost);
      if (e.status === "PENDING") {
        s.pendingPoints += e.points;
      } else {
        s.balance += e.points;
        s.costCents += cost;
      }
      continue;
    }

    if (e.status === "PENDING") {
      s.pendingPoints += e.points;
      entryCosts.set(e.id, e.points > 0 ? e.inputCostCents : 0);
      continue;
    }

    if (e.points < 0) {
      const qty = -e.points;
      if (qty > s.balance) {
        return { ok: false, erro: "Saldo insuficiente para o débito", entryId: e.id };
      }
      let removed: number;
      const pp = Math.min(e.priorityPoints ?? 0, qty, s.balance);
      if (pp > 0 && e.priorityCostCents != null) {
        const pc = Math.min(e.priorityCostCents, s.costCents);
        const restQty = qty - pp;
        const restBalance = s.balance - pp;
        removed = pc + (restQty > 0 && restBalance > 0 ? Math.round(((s.costCents - pc) * restQty) / restBalance) : 0);
      } else {
        removed = Math.round((s.costCents * qty) / s.balance);
      }
      s.balance -= qty;
      s.costCents -= removed;
      entryCosts.set(e.id, -removed);
      if (e.groupId && e.type === "TRANSFER_OUT") {
        groupCost.set(e.groupId, (groupCost.get(e.groupId) ?? 0) + removed);
      }
      continue;
    }

    const cost = e.inputCostCents;
    s.investedCents += cost;
    s.balance += e.points;
    s.costCents += cost;
    entryCosts.set(e.id, cost);
  }

  return { ok: true, entryCosts, accounts };
}

/** Custo por milheiro em centavos: custo / pontos × 1000. */
export function cpmCents(costCents: number, points: number): number | null {
  if (points <= 0) return null;
  return Math.round((costCents * 1000) / points);
}

/** Valor estimado (mercado) — diferente do custo de aquisição. */
export function marketValueCents(points: number, marketCpmCents: number): number {
  return Math.round((points * marketCpmCents) / 1000);
}
