// Equipe: recorrência das tarefas e comissão dos parceiros nas vendas.

export const RECURRENCES = { NONE: "Sem recorrência", DAILY: "Diária", WEEKLY: "Semanal", BIWEEKLY: "Quinzenal", MONTHLY: "Mensal", QUARTERLY: "Trimestral", SEMIANNUAL: "Semestral", YEARLY: "Anual" } as const;
export type Recurrence = keyof typeof RECURRENCES;

/** Próximo prazo da tarefa recorrente (AAAA-MM-DD). Mês curto: fica no último dia (31/01 → 28/02). */
export function nextDue(due: string, r: Recurrence): string | null {
  if (r === "NONE") return null;
  const d = new Date(`${due.slice(0, 10)}T00:00:00Z`);
  const days = { DAILY: 1, WEEKLY: 7, BIWEEKLY: 14 }[r as "DAILY" | "WEEKLY" | "BIWEEKLY"];
  if (days) return new Date(d.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const months = { MONTHLY: 1, QUARTERLY: 3, SEMIANNUAL: 6, YEARLY: 12 }[r as "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "YEARLY"]!;
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last))).toISOString().slice(0, 10);
}

/** Colunas de um quadro de tarefas. A primeira é "pendente", a última "concluída" e as do meio "em progresso". */
export type BoardColumn = { id: string; name: string };
export const BASIC_COLUMNS: BoardColumn[] = [{ id: "todo", name: "A fazer" }, { id: "doing", name: "Em andamento" }, { id: "done", name: "Concluído" }];

export function columnStatus(cols: BoardColumn[], idx: number) {
  if (idx <= 0) return "TODO";
  return idx === cols.length - 1 ? "DONE" : "DOING";
}

/** Coluna da tarefa: a que ela escolheu (se ainda existe) ou a que corresponde à situação. */
export function columnOf(cols: BoardColumn[], t: { columnId?: string | null; status: string }) {
  if (!cols.length) return null;
  if (t.columnId && cols.some((c) => c.id === t.columnId)) return t.columnId;
  if (t.status === "DONE" && cols.length > 1) return cols[cols.length - 1]!.id;
  if (t.status === "DOING" && cols.length > 2) return cols[1]!.id;
  return cols[0]!.id;
}

export const PARTNER_MODES = { PROFIT_PCT: "% do lucro", SALE_PCT: "% da venda", FIXED: "Valor fixo (R$)" } as const;
export type PartnerMode = keyof typeof PARTNER_MODES;

/** Comissão do parceiro na venda: % do lucro (nunca negativa), % do total da venda ou valor fixo. value = % × 100 ou centavos. */
export function partnerCommission(mode: string, value: number, sale: { totalCents: number; resultCents: number }) {
  if (mode === "FIXED") return Math.max(0, value);
  if (mode === "SALE_PCT") return Math.max(0, Math.round((sale.totalCents * value) / 10_000));
  return Math.max(0, Math.round((sale.resultCents * value) / 10_000));
}

export const describePartner = (mode: string, value: number) =>
  mode === "FIXED" ? `R$ ${(value / 100).toFixed(2).replace(".", ",")} por venda` : `${(value / 100).toLocaleString("pt-BR")}% ${mode === "SALE_PCT" ? "da venda" : "do lucro"}`;
