import { requirePageUser } from "@/server/session";
import { listSuppliers, listSupplierAccounts } from "@/server/services/extras";
import { listPrograms } from "@/server/services/admin";
import { PageHeader } from "@/components/stat";
import { Segmented } from "@/components/ui";
import { SupplierAccounts, Suppliers } from "./client";

export default async function ManagementPage({ searchParams }: { searchParams: Promise<{ tab?: string; programId?: string; supplierId?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const tab = sp.tab === "fornecedores" ? "fornecedores" : "contas";
  const [suppliers, accounts, programs] = await Promise.all([
    listSuppliers(user.id),
    listSupplierAccounts(user.id, { programId: sp.programId, supplierId: sp.supplierId }),
    listPrograms(false),
  ]);
  return (
    <>
      <PageHeader title="Fornecedores" subtitle="Contas de terceiros que você administra e de quem compra milhas" />
      <Segmented center active={tab} items={[{ key: "contas", label: "Contas", href: "/app/management" }, { key: "fornecedores", label: "Fornecedores", href: "/app/management?tab=fornecedores" }]} />
      {tab === "contas" ? (
        <SupplierAccounts
          programId={sp.programId ?? ""}
          supplierId={sp.supplierId ?? ""}
          programs={programs.map((p) => ({ id: p.id, name: p.name }))}
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
          accounts={accounts.map((a) => ({ id: a.id, supplierId: a.supplierId, supplier: a.supplier.name, programId: a.programId, program: a.program.name, color: a.program.color, identifier: a.identifier, balance: a.balance, priceCpmCents: a.priceCpmCents, cpfAvailable: a.cpfAvailable, notes: a.notes, updatedAt: a.updatedAt.toISOString(), tags: a.tags, avgUsage: a.sales.length ? Math.round(a.sales.reduce((t, x) => t + x.points, 0) / a.sales.length) : null }))}
        />
      ) : (
        <Suppliers suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, contact: s.contact, notes: s.notes, accounts: s._count.accounts, balance: s.accounts.reduce((t, a) => t + a.balance, 0) }))} />
      )}
    </>
  );
}
