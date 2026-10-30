import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { listDeals } from "@/server/services/miles-deals";
import { PageHeader } from "@/components/stat";
import { DealsKanban } from "./client";

export default async function CrmMilhasPage() {
  const user = await requirePageUser();
  const [deals, customers, accounts] = await Promise.all([
    listDeals(user.id),
    prisma.customer.findMany({ where: { userId: user.id }, select: { id: true, name: true, phone: true }, orderBy: { name: "asc" } }),
    prisma.account.findMany({ where: { userId: user.id, archived: false }, select: { id: true, nickname: true, balance: true, costCents: true, program: { select: { name: true } }, holder: { select: { name: true } } }, orderBy: [{ program: { name: "asc" } }, { holder: { name: "asc" } }] }),
  ]);
  return (
    <>
      <PageHeader title="CRM Milhas" subtitle="Negociações de venda de milhas. Ao arrastar para Pago, a venda é lançada em Vendas com a baixa dos pontos." />
      <DealsKanban
        deals={deals}
        customers={customers}
        accounts={accounts.map((a) => ({ id: a.id, label: a.nickname || `${a.program.name} · ${a.holder.name}`, balance: a.balance, cpmCents: a.balance > 0 ? Math.round((a.costCents * 1000) / a.balance) : null }))}
      />
    </>
  );
}
