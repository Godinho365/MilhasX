import { requirePageUser, selectedHolderId } from "@/server/session";
import { cardsOverview } from "@/server/services/extras";
import { listAccounts } from "@/server/services/wallet";
import { upcomingCardReminders } from "@/server/services/card-details";
import { brDay } from "@/domain/brasilia";
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
  // Titular marcado no topo: cartões e contas do formulário só dele
  const holderId = await selectedHolderId(user.id);
  const today = brDay();
  const [o, accounts, reminders] = await Promise.all([cardsOverview(user.id, holderId), listAccounts(user.id, holderId), upcomingCardReminders(user.id, today)]);
  return (
    <CardsClient
      today={today}
      stats={o.stats}
      reminders={reminders}
      accounts={accounts.map((a) => ({ id: a.id, label: `${a.program.name} · ${a.holder.name}`, holder: a.holder.name }))}
      actions={o.actions.map((a) => ({ ...a, dueDate: a.dueDate.toISOString() }))}
      cards={o.cards.map((c) => ({
        id: c.id, name: c.name, brand: c.brand, program: c.account.program.name, programId: c.account.programId, logo: c.account.program.logoUpdatedAt?.getTime().toString() ?? null, color: c.account.program.color, holder: c.account.holder.name, accountId: c.accountId,
        pointsPerDollar: c.pointsPerDollar / 100, dollarRateCents: c.dollarRateCents, closingDay: c.closingDay, dueDay: c.dueDay,
        annualFeeCents: c.annualFeeCents, feeWaiverCents: c.feeWaiverCents, otherIsPersonal: c.otherIsPersonal,
        bank: c.bank, brandTier: c.brandTier, last4: c.last4, printedName: c.printedName, modality: c.modality, cardType: c.cardType, status: c.status,
        expMonth: c.expMonth, expYear: c.expYear, limitCents: c.limitCents, annualFeeMonth: c.annualFeeMonth, cardColor: c.color,
        benefits: c.benefits, benefitsUrl: c.benefitsUrl, tags: c.tags, notes: c.notes,
        ...currentCpm(c),
        balancePoints: c.balanceEntry?.points ?? 0, balanceDate: c.balanceEntry?.occurredAt.toISOString().slice(0, 10) ?? null,
        received: c.invoices.filter((i) => i.entry?.status === "CONFIRMED").reduce((s, i) => s + (i.entry?.points ?? 0), 0),
        invoices: c.invoices.map((i) => ({
          id: i.id, closingDate: i.closingDate.toISOString(), dueDate: i.dueDate.toISOString(), amountCents: i.amountCents, expectedPoints: i.expectedPoints, feeCents: i.feeCents, pointsIncluded: i.pointsIncluded,
          status: i.status === "OPEN" ? "OPEN" : i.entry?.status === "CONFIRMED" ? "RECEIVED" : "CLOSED",
        })),
      }))}
    />
  );
}
