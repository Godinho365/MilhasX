// Cartões de indicadores da conta (ou do programa somando os titulares) no período escolhido.
// Os valores saem prontos daqui; a ordem e quais aparecem ficam com o "Organizar" (CardsGrid).
import { fmtBRL, fmtDate, fmtPts } from "@/lib/format";
import { rangeLabel } from "@/lib/day-range";
import type { AccountsPeriod } from "@/server/services/account-month";
import { CardsGrid, type Card } from "./cards-grid";

export function PeriodCards({ m, showValues, marketValueCents }: { m: AccountsPeriod; showValues: boolean; marketValueCents: number | null }) {
  const money = (c: number | null) => (showValues ? fmtBRL(c) : "R$ •••");
  const period = rangeLabel(m.range).toLowerCase();
  const single = m.rows.length === 1 ? m.rows[0]! : null;
  const clubs = m.rows.filter((r) => r.club.active).length;
  const club = single?.club;
  const cards: Card[] = [
    { key: "lucro", label: "Lucro", value: money(m.sales.profitCents), sub: `${m.sales.count} ${m.sales.count === 1 ? "venda" : "vendas"} · ${period}`, icon: "dollar", tone: m.sales.profitCents > 0 ? "text-ok" : m.sales.profitCents < 0 ? "text-bad" : "" },
    { key: "vendido", label: "Total vendido", value: money(m.sales.totalCents), sub: period, icon: "trend" },
    { key: "rendimento", label: "Rendimento", value: m.sales.roePct == null ? "-" : `${m.sales.roePct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`, sub: "retorno sobre o custo das milhas vendidas", icon: "percent" },
    { key: "saldo", label: "Saldo atual", value: fmtPts(m.balance), sub: single ? "milhas" : `milhas em ${m.rows.length} ${m.rows.length === 1 ? "conta" : "contas"}`, icon: "wallet" },
    { key: "cpm", label: "CPM", value: money(m.cpmCents), sub: single ? "custo por milheiro" : "custo médio por milheiro", icon: "card" },
    { key: "investido", label: "Valor investido", value: money(m.stockCents), sub: "custo das milhas em saldo", icon: "dollar" },
    { key: "mercado", label: "Valor de mercado", value: money(marketValueCents), sub: "quanto o saldo vale vendido hoje", icon: "trend" },
    { key: "receber", label: "Pontos a receber", value: fmtPts(m.pendingPoints), sub: "lançamentos pendentes", icon: "package" },
    { key: "cpfs", label: "CPFs usados", value: m.cpf ? `${m.cpf.used}/${m.cpf.limit}` : "-", sub: m.cpf ? `${Math.max(0, m.cpf.limit - m.cpf.used)} disponíveis` : "sem limite de CPFs", icon: "users" },
    { key: "media", label: "Média utilizável", value: m.perCpf != null ? fmtPts(m.perCpf) : "-", sub: "milhas por CPF livre", icon: "calc" },
    club
      ? { key: "clube", label: "Tempo de clube", value: club.active ? (club.months ? `${club.months} ${club.months === 1 ? "mês" : "meses"}` : "Este mês") : "Sem clube", sub: club.since ? `${club.active ? "Membro" : "Primeiro clube"} desde ${fmtDate(club.since)}` : "nenhum ponto de clube lançado", icon: "calendar", tone: club.active ? "" : "text-muted" }
      : { key: "clube", label: "Clube ativo", value: `${clubs}/${m.rows.length}`, sub: "contas com clube pago", icon: "calendar" },
  ];
  return <CardsGrid cards={cards} />;
}
