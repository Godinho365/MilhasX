// Calendário de clubes (Milhas › Calendário): as cobranças de cada clube no ano, dia a dia. O que já aconteceu vem
// dos pontos de clube lançados no Extrato; o que vem pela frente é projetado da recorrência do clube.

export type ClubFreq = "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type ClubEvent = { clubId: string; day: string; points: number; costCents: number; projected: boolean };

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (day: string) => new Date(`${day}T00:00:00Z`);

/** Próxima data da recorrência (mesma regra das recorrências do Extrato: mensal mantém o dia, ajustando meses curtos). */
export function nextClubDate(day: string, f: ClubFreq, interval = 1, dayOfMonth?: number | null): string {
  const n = utc(day);
  if (f === "DAILY" || f === "WEEKLY") {
    n.setUTCDate(n.getUTCDate() + (f === "DAILY" ? 1 : 7) * Math.max(1, interval));
    return iso(n);
  }
  const months = (f === "MONTHLY" ? 1 : f === "QUARTERLY" ? 3 : 12) * Math.max(1, interval);
  const want = dayOfMonth ?? n.getUTCDate();
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + months);
  const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
  n.setUTCDate(Math.min(want, last));
  return iso(n);
}

/** Cobranças futuras do clube entre `from` e `to` (inclusive), a partir da próxima data, até o fim do plano. */
export function projectClub(
  c: { id: string; nextDate: string; frequency: ClubFreq; interval: number; dayOfMonth: number | null; endDate: string | null; points: number; costCents: number },
  from: string,
  to: string,
): ClubEvent[] {
  const out: ClubEvent[] = [];
  const stop = c.endDate && c.endDate < to ? c.endDate : to;
  let d = c.nextDate;
  for (let i = 0; d <= stop && i < 400; i++) {
    if (d >= from) out.push({ clubId: c.id, day: d, points: c.points, costCents: c.costCents, projected: true });
    d = nextClubDate(d, c.frequency, c.interval, c.dayOfMonth);
  }
  return out;
}

/** Os 12 meses do ano: semanas (domingo a sábado) com o dia ou vazio, e as cobranças de cada dia. */
export function yearMonths(year: number, events: ClubEvent[]) {
  const byDay = new Map<string, ClubEvent[]>();
  for (const e of events) byDay.set(e.day, [...(byDay.get(e.day) ?? []), e]);
  return Array.from({ length: 12 }, (_, m) => {
    const month = `${year}-${String(m + 1).padStart(2, "0")}`;
    const days = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    const lead = new Date(Date.UTC(year, m, 1)).getUTCDay();
    const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
    while (cells.length % 7) cells.push(null);
    const evs = events.filter((e) => e.day.startsWith(month)).sort((a, b) => a.day.localeCompare(b.day));
    return {
      month,
      weeks: Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7)),
      byDay,
      events: evs,
      totalCents: evs.reduce((t, e) => t + e.costCents, 0),
      points: evs.reduce((t, e) => t + e.points, 0),
    };
  });
}
