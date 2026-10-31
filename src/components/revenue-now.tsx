// Receita de hoje, da semana e do mês (horário de Brasília), usada em Vendas e no relatório de Vendas.
import { Stat } from "@/components/stat";
import { fmtBRL } from "@/lib/format";
import type { RevenueWindow } from "@/domain/brasilia";

const hint = (w: RevenueWindow) => (w.count === 0 ? "nenhuma venda" : `${w.count} ${w.count === 1 ? "venda" : "vendas"} · lucro ${fmtBRL(w.profitCents)}`);

export function RevenueNow({ r }: { r: { day: RevenueWindow; week: RevenueWindow; month: RevenueWindow } }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4" aria-label="Receita no horário de Brasília">
      <Stat label="Receita do dia" value={fmtBRL(r.day.revenueCents)} hint={hint(r.day)} accent />
      <Stat label="Receita da semana" value={fmtBRL(r.week.revenueCents)} hint={hint(r.week)} />
      <Stat label="Receita do mês" value={fmtBRL(r.month.revenueCents)} hint={hint(r.month)} />
    </div>
  );
}
