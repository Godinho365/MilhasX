// Cartões de indicadores da conta (ou do programa somando os titulares) no período escolhido.
import { Wallet, Package, DollarSign, Percent, CreditCard, Users, Calculator, CalendarDays, TrendingUp } from "lucide-react";
import { fmtBRL, fmtDate, fmtPts } from "@/lib/format";
import { rangeLabel } from "@/lib/day-range";
import type { AccountsPeriod } from "@/server/services/account-month";

/** Cartão de indicador: rótulo, valor, legenda e ícone no canto. */
function StatCard({ label, value, sub, icon, tone }: { label: string; value: string; sub: string; icon: React.ReactNode; tone?: string }) {
  return (
    <div className="card card-pad">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-muted">{label}</p>
        <span className="text-muted" aria-hidden>{icon}</span>
      </div>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${tone ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted">{sub}</p>
    </div>
  );
}

export function PeriodCards({ m, showValues, marketValueCents }: { m: AccountsPeriod; showValues: boolean; marketValueCents: number | null }) {
  const money = (c: number | null) => (showValues ? fmtBRL(c) : "R$ •••");
  const period = rangeLabel(m.range).toLowerCase();
  const single = m.rows.length === 1 ? m.rows[0]! : null;
  const clubs = m.rows.filter((r) => r.club.active).length;
  const club = single?.club;
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard label="Lucro" value={money(m.sales.profitCents)} sub={`${m.sales.count} ${m.sales.count === 1 ? "venda" : "vendas"} · ${period}`} icon={<DollarSign className="h-5 w-5" />} tone={m.sales.profitCents > 0 ? "text-ok" : m.sales.profitCents < 0 ? "text-bad" : ""} />
      <StatCard label="Total vendido" value={money(m.sales.totalCents)} sub={period} icon={<TrendingUp className="h-5 w-5" />} />
      <StatCard label="Rendimento" value={m.sales.roePct == null ? "-" : `${m.sales.roePct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`} sub="retorno sobre o custo das milhas vendidas" icon={<Percent className="h-5 w-5" />} />
      <StatCard label="Saldo atual" value={fmtPts(m.balance)} sub={single ? "milhas" : `milhas em ${m.rows.length} ${m.rows.length === 1 ? "conta" : "contas"}`} icon={<Wallet className="h-5 w-5" />} />
      <StatCard label="CPM" value={money(m.cpmCents)} sub={single ? "custo por milheiro" : "custo médio por milheiro"} icon={<CreditCard className="h-5 w-5" />} />
      <StatCard label="Valor investido" value={money(m.stockCents)} sub="custo das milhas em saldo" icon={<DollarSign className="h-5 w-5" />} />
      <StatCard label="Pontos a receber" value={fmtPts(m.pendingPoints)} sub={`valor de mercado do saldo: ${money(marketValueCents)}`} icon={<Package className="h-5 w-5" />} />
      <StatCard label="CPFs usados" value={m.cpf ? `${m.cpf.used}/${m.cpf.limit}` : "-"} sub={m.cpf ? `${Math.max(0, m.cpf.limit - m.cpf.used)} disponíveis` : "sem limite de CPFs"} icon={<Users className="h-5 w-5" />} />
      <StatCard label="Média utilizável" value={m.perCpf != null ? fmtPts(m.perCpf) : "-"} sub="milhas por CPF livre" icon={<Calculator className="h-5 w-5" />} />
      {club ? (
        <StatCard label="Tempo de clube" value={club.active ? (club.months ? `${club.months} ${club.months === 1 ? "mês" : "meses"}` : "Este mês") : "Sem clube"} sub={club.since ? `${club.active ? "Membro" : "Primeiro clube"} desde ${fmtDate(club.since)}` : "nenhum ponto de clube lançado"} icon={<CalendarDays className="h-5 w-5" />} tone={club.active ? "" : "text-muted"} />
      ) : (
        <StatCard label="Clube ativo" value={`${clubs}/${m.rows.length}`} sub="contas com clube pago" icon={<CalendarDays className="h-5 w-5" />} />
      )}
    </div>
  );
}
