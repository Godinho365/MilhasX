// Períodos de dias (AAAA-MM-DD): contas de data e atalhos do seletor de período.
export type DayRange = { from: string; to: string } | null; // null = todo o período

export const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];

// Datas como AAAA-MM-DD em UTC: sem fuso no meio das contas.
export const toDate = (d: string) => new Date(`${d}T00:00:00Z`);
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(new Date(toDate(d).getTime() + n * 86_400_000));
export const monthStart = (d: string) => `${d.slice(0, 7)}-01`;
export const addMonths = (d: string, n: number) => { const x = toDate(monthStart(d)); x.setUTCMonth(x.getUTCMonth() + n); return iso(x); };
const monthEnd = (d: string) => addDays(addMonths(d, 1), -1);
const weekStart = (d: string) => addDays(d, -((toDate(d).getUTCDay() + 6) % 7)); // segunda
export const brShort = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

export function monthRange(d: string): { from: string; to: string } {
  return { from: monthStart(d), to: monthEnd(d) };
}
const isWholeMonth = (r: DayRange) => !!r && r.from === monthStart(r.from) && r.to === monthEnd(r.from);

export function shortcuts(t: string): { label: string; range: DayRange }[] {
  const ws = weekStart(t);
  return [
    { label: "Hoje", range: { from: t, to: t } },
    { label: "Ontem", range: { from: addDays(t, -1), to: addDays(t, -1) } },
    { label: "Últimos 7 dias", range: { from: addDays(t, -6), to: t } },
    { label: "Últimos 30 dias", range: { from: addDays(t, -29), to: t } },
    { label: "Esta semana", range: { from: ws, to: addDays(ws, 6) } },
    { label: "Semana passada", range: { from: addDays(ws, -7), to: addDays(ws, -1) } },
    { label: "Este mês", range: monthRange(t) },
    { label: "Mês passado", range: monthRange(addMonths(t, -1)) },
    { label: "Este ano", range: { from: `${t.slice(0, 4)}-01-01`, to: `${t.slice(0, 4)}-12-31` } },
    { label: "Todo o período", range: null },
  ];
}

export function rangeLabel(r: DayRange) {
  if (!r) return "Todo o período";
  if (isWholeMonth(r)) return `${MONTHS[Number(r.from.slice(5, 7)) - 1]} ${r.from.slice(0, 4)}`;
  if (r.from === r.to) return `${brShort(r.from)}/${r.from.slice(0, 4)}`;
  const sameYear = r.from.slice(0, 4) === r.to.slice(0, 4);
  return `${brShort(r.from)}${sameYear ? "" : `/${r.from.slice(0, 4)}`} – ${brShort(r.to)}/${r.to.slice(0, 4)}`;
}
