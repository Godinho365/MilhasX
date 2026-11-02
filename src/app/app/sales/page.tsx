import { requirePageUser, selectedHolderId } from "@/server/session";
import { listCustomers } from "@/server/services/market";
import { listSales, getSale } from "@/server/services/sales";
import { salesNow } from "@/server/services/reports";
import { RevenueNow } from "@/components/revenue-now";
import { listAccounts } from "@/server/services/wallet";
import { listSupplierAccounts } from "@/server/services/extras";
import { saleQuerySchema } from "@/server/schemas";
import { prisma } from "@/server/db";
import { PageHeader, Stat } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { Activity, DollarSign, Plane, Receipt, Target, TrendingUp } from "lucide-react";
import { SalesClient, CustomersClient } from "./client";
import { fmtBRL, fmtPts } from "@/lib/format";
import { brDay } from "@/domain/brasilia";
import { monthRange } from "@/lib/day-range";

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = sp.tab === "clientes" ? "clientes" : "vendas";
  const holderId = await selectedHolderId(user.id);
  // período: o que veio na URL; sem nada, o mês atual (em Brasília); "periodo=tudo" mostra todas
  const month = monthRange(brDay());
  const period = sp.from || sp.to || sp.periodo === "tudo" ? sp : { ...sp, ...month };
  const parsed = saleQuerySchema.safeParse(Object.fromEntries(Object.entries(period).filter(([k, v]) => v && k !== "tab" && k !== "periodo")));
  const range = parsed.success && (parsed.data.from || parsed.data.to) ? { from: period.from ?? period.to!, to: period.to ?? period.from! } : null;
  const [sales, customers, accounts, suppliers, cards, now] = await Promise.all([
    listSales(user.id, { ...(parsed.success ? parsed.data : {}), holderId }),
    listCustomers(user.id),
    listAccounts(user.id, holderId),
    listSupplierAccounts(user.id),
    prisma.creditCard.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    salesNow({ userId: user.id, holderId }),
  ]);
  const toEdit = sp.edit ? await prisma.sale.findFirst({ where: { userId: user.id, groupId: sp.edit }, select: { id: true } }) : null;
  const editSale = toEdit ? await getSale(user.id, toEdit.id) : null;
  const total = sales.reduce((s, x) => s + x.totalCents, 0);
  const result = sales.reduce((s, x) => s + x.resultCents, 0);
  const pts = sales.reduce((s, x) => s + x.points, 0);
  const invested = sales.reduce((s, x) => s + x.investedCents, 0);
  const priced = sales.reduce((s, x) => s + x.pricedCents, 0);
  const cpfs = sales.reduce((s, x) => s + x.cpfs, 0);
  const count = sales.filter((x) => !x.refund).length; // reembolsadas não contam como venda
  const soldCpfs = sales.filter((x) => !x.refund).reduce((s, x) => s + x.cpfs, 0);
  const cost = sales.reduce((s, x) => s + x.costCents, 0);
  const milesCost = sales.reduce((s, x) => s + x.milesCostCents, 0);
  const pctFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <>
      <PageHeader title="Vendas" subtitle="Vendas de emissão: valor cobrado, custo dos pontos e resultado" />
      <Segmented center active={tab} items={[{ key: "vendas", label: "Vendas", href: "/app/sales" }, { key: "clientes", label: "Clientes", href: "/app/sales?tab=clientes" }]} />
      {tab === "vendas" ? (
        <>
          <div className="mb-4"><RevenueNow r={now} /></div>
          {sales.length > 0 && (
            <div className="mb-4 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              <Stat icon={<Target className="h-4 w-4" />} label="Lucro total" value={fmtBRL(result)} accent={result >= 0} negative={result < 0} hint={total > 0 ? `${pctFmt((result / total) * 100)} do total vendido` : undefined} />
              <Stat icon={<TrendingUp className="h-4 w-4" />} label="Total de vendas" value={fmtBRL(total)} hint={`${count} ${count === 1 ? "venda" : "vendas"}${count > 0 ? ` · ticket médio ${fmtBRL(Math.round(total / count))}` : ""}`} />
              <Stat icon={<DollarSign className="h-4 w-4" />} label="Custo total" value={fmtBRL(cost)} hint="milhas, emissões pagas e taxas repassadas" />
              <Stat icon={<Receipt className="h-4 w-4" />} label="Custo das milhas" value={fmtBRL(milesCost)} hint={pts > 0 && milesCost > 0 ? `milheiro médio ${fmtBRL(Math.round((milesCost * 1000) / pts))}` : "custo dos pontos usados"} />
              <Stat icon={<Plane className="h-4 w-4" />} label="Total de milhas" value={fmtPts(pts)} hint={soldCpfs > 0 ? `média por emissão: ${fmtPts(Math.round(pts / soldCpfs))}` : undefined} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Performance (ROE)" value={invested > 0 ? pctFmt((result / invested) * 100) : "-"} hint={[priced > 0 && `margem ${pctFmt((result / priced) * 100)}`, cpfs > 0 && `lucro por CPF ${fmtBRL(Math.round(result / cpfs))} (${cpfs} ${cpfs === 1 ? "CPF" : "CPFs"})`].filter(Boolean).join(" · ")} />
            </div>
          )}
          <SalesClient
            sp={sp}
            range={range}
            sales={sales}
            editSale={editSale}
            accounts={accounts.map((a) => ({ id: a.id, label: `${a.program.name} ${a.holder.name}`, balance: a.balance, costCents: a.costCents }))}
            suppliers={suppliers.map((s) => ({ id: s.id, label: `${s.program.name} · ${s.supplier.name}${s.identifier ? ` (${s.identifier})` : ""}`, balance: s.balance, priceCpmCents: s.priceCpmCents }))}
            customers={customers.map((c) => ({ id: c.id, name: c.name, kind: c.kind === "AGENCY" ? "AGENCY" : "FINAL" }))}
            cards={cards}
          />
        </>
      ) : (
        <CustomersClient
          customers={customers.map((c) => ({
            id: c.id,
            name: c.name,
            kind: c.kind === "AGENCY" ? "AGENCY" : "FINAL",
            docType: c.docType,
            docNumber: c.docNumber,
            email: c.email,
            phone: c.phone,
            documents: (c.documents as { type: string; number: string }[] | null) ?? [],
            lastPurchase: c.lastPurchase?.toISOString() ?? null,
            purchases: c.purchases,
          }))}
        />
      )}
    </>
  );
}
