// Datas no horário de Brasília: o "hoje" do usuário e as janelas de dia, semana e mês das vendas.
export const BR_TZ = "America/Sao_Paulo";

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: BR_TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** Dia corrente em Brasília no formato AAAA-MM-DD (após as 21h o UTC já virou o dia seguinte). */
export const brDay = (now: Date = new Date()) => dayFmt.format(now);

/** Início do dia, da semana (segunda) e do mês em Brasília, como AAAA-MM-DD. */
export function brWindows(now: Date = new Date()) {
  const day = brDay(now);
  const d = new Date(`${day}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7; // segunda = 0
  const week = new Date(d.getTime() - back * 86_400_000).toISOString().slice(0, 10);
  return { day, week, month: `${day.slice(0, 7)}-01` };
}

type Sold = { date: string; totalCents: number; resultCents: number };
export type RevenueWindow = { revenueCents: number; profitCents: number; count: number };

/** Receita, lucro e nº de vendas de hoje, desta semana e deste mês. A data da venda é um dia (AAAA-MM-DD…). */
export function revenueWindows(sales: Sold[], now: Date = new Date()) {
  const w = brWindows(now);
  const empty = (): RevenueWindow => ({ revenueCents: 0, profitCents: 0, count: 0 });
  const out = { day: empty(), week: empty(), month: empty() };
  for (const s of sales) {
    const day = s.date.slice(0, 10);
    if (day > w.day) continue;
    for (const k of ["day", "week", "month"] as const) {
      if (day >= w[k]) {
        out[k].revenueCents += s.totalCents;
        out[k].profitCents += s.resultCents;
        out[k].count++;
      }
    }
  }
  return { ...out, starts: w };
}
