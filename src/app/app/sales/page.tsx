import { requirePageUser, selectedHolderId } from "@/server/session";
import { listCustomers } from "@/server/services/market";
import { listSales } from "@/server/services/sales";
import { listAccounts } from "@/server/services/wallet";
import { listSupplierAccounts } from "@/server/services/extras";
import { saleQuerySchema } from "@/server/schemas";
import { prisma } from "@/server/db";
import { PageHeader, Stat } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { SalesClient, CustomersClient } from "./client";
import { fmtBRL, fmtPts } from "@/lib/format";

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = sp.tab === "clientes" ? "clientes" : "vendas";
  const holderId = await selectedHolderId(user.id);
  const parsed = saleQuerySchema.safeParse(Object.fromEntries(Object.entries(sp).filter(([k, v]) => v && k !== "tab")));
  const [sales, customers, accounts, suppliers, cards] = await Promise.all([
    listSales(user.id, { ...(parsed.success ? parsed.data : {}), holderId }),
    listCustomers(user.id),
    listAccounts(user.id, holderId),
    listSupplierAccounts(user.id),
    prisma.creditCard.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const total = sales.reduce((s, x) => s + x.totalCents, 0);
  const result = sales.reduce((s, x) => s + x.resultCents, 0);
  const pts = sales.reduce((s, x) => s + x.points, 0);
  const invested = sales.reduce((s, x) => s + x.investedCents, 0);
  const priced = sales.reduce((s, x) => s + x.pricedCents, 0);
  const cpfs = sales.reduce((s, x) => s + x.cpfs, 0);
  const pctFmt = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  return (
    <>
      <PageHeader title="Vendas" subtitle="Vendas de emissão: valor cobrado, custo dos pontos e resultado" />
      <Segmented center active={tab} items={[{ key: "vendas", label: "Vendas", href: "/app/sales" }, { key: "clientes", label: "Clientes", href: "/app/sales?tab=clientes" }]} />
      {tab === "vendas" ? (
        <>
          {sales.length > 0 && (
            <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 2xl:grid-cols-7">
              <Stat label="Vendas" value={String(sales.length)} />
              <Stat label="Total vendido" value={fmtBRL(total)} />
              <Stat label="Resultado" value={fmtBRL(result)} accent />
              <Stat label="Pontos vendidos" value={fmtPts(pts)} />
              <Stat label="Margem" value={priced > 0 ? pctFmt((result / priced) * 100) : "-"} hint="resultado ÷ preço de venda" />
              <Stat label="ROE" value={invested > 0 ? pctFmt((result / invested) * 100) : "-"} hint="resultado ÷ custo investido" />
              <Stat label="Lucro por CPF" value={cpfs > 0 ? fmtBRL(Math.round(result / cpfs)) : "-"} hint={`${cpfs} ${cpfs === 1 ? "CPF emitido" : "CPFs emitidos"}`} />
            </div>
          )}
          <SalesClient
            sp={sp}
            sales={sales}
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
