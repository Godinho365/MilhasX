import { requirePageUser } from "@/server/session";
import { cardsOverview } from "@/server/services/extras";
import { listAccounts } from "@/server/services/wallet";
import { PageHeader } from "@/components/stat";
import { CardsClient } from "./client";

/**
 * CPM atual dos pontos do cartão: custo e saldo da conta que recebe os pontos, somando o que as
 * faturas em aberto ainda vão trazer: a parcela da anuidade (se o mês não isentar) e os pontos
 * (menos os que já estão no saldo acumulado).
 */
function currentCpm(c: { account: { balance: number; costCents: number }; invoices: { status: string; feeCents: number; expectedPoints: number; pointsIncluded: boolean }[] }) {
  const open = c.invoices.filter((i) => i.status === "OPEN");
  const openFeeCents = open.reduce((t, i) => t + i.feeCents, 0);
  const points = c.account.balance + open.filter((i) => !i.pointsIncluded).reduce((t, i) => t + i.expectedPoints, 0);
  const cost = c.account.costCents + openFeeCents;
  return { accountBalance: c.account.balance, openFeeCents, accountCpmCents: points > 0 && cost > 0 ? Math.round((cost * 1000) / points) : null };
}

export default async function CreditCardsPage() {
  const user = await requirePageUser();
  const [o, accounts] = await Promise.all([cardsOverview(user.id), listAccounts(user.id)]);
  return (
    <>
      <PageHeader title="Cartões de Crédito" subtitle="Faturas, pontuação esperada e pontos recebidos de cada cartão" />
      <CardsClient
        stats={o.stats}
        accounts={accounts.map((a) => ({ id: a.id, label: `${a.program.name} · ${a.holder.name}` }))}
        actions={o.actions.map((a) => ({ ...a, dueDate: a.dueDate.toISOString() }))}
        cards={o.cards.map((c) => ({
          id: c.id, name: c.name, brand: c.brand, program: c.account.program.name, color: c.account.program.color, holder: c.account.holder.name, accountId: c.accountId,
          pointsPerDollar: c.pointsPerDollar / 100, dollarRateCents: c.dollarRateCents, closingDay: c.closingDay, dueDay: c.dueDay,
          annualFeeCents: c.annualFeeCents, feeWaiverCents: c.feeWaiverCents,
          ...currentCpm(c),
          balancePoints: c.balanceEntry?.points ?? 0, balanceDate: c.balanceEntry?.occurredAt.toISOString().slice(0, 10) ?? null,
          received: c.invoices.filter((i) => i.entry?.status === "CONFIRMED").reduce((s, i) => s + (i.entry?.points ?? 0), 0),
          invoices: c.invoices.map((i) => ({
            id: i.id, closingDate: i.closingDate.toISOString(), dueDate: i.dueDate.toISOString(), amountCents: i.amountCents, expectedPoints: i.expectedPoints, feeCents: i.feeCents, pointsIncluded: i.pointsIncluded,
            status: i.status === "OPEN" ? "OPEN" : i.entry?.status === "CONFIRMED" ? "RECEIVED" : "CLOSED",
          })),
        }))}
      />
    </>
  );
}
