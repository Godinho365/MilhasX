// ViajeFácil (Smiles): situação de cada reserva pelo prazo para quitar com milhas.

export type DeadlineStatus = "paid" | "overdue" | "today" | "soon" | "ok";
export const SOON_DAYS = 7;

/** Dias até a data limite (AAAA-MM-DD, pelo dia de Brasília de hoje) e a situação: quitada, vencida, vence hoje, vence em até 7 dias ou no prazo. */
export function deadlineStatus(deadline: string, paid: boolean, today: string): { status: DeadlineStatus; days: number } {
  const days = Math.round((Date.parse(`${deadline.slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (paid) return { status: "paid", days };
  if (days < 0) return { status: "overdue", days };
  if (days === 0) return { status: "today", days };
  return { status: days <= SOON_DAYS ? "soon" : "ok", days };
}

export const CABIN_LABELS: Record<string, string> = { ECONOMY: "Econômica", PREMIUM: "Premium Economy", BUSINESS: "Executiva", FIRST: "Primeira" };
