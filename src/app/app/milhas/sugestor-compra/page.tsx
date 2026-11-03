import { requirePageUser } from "@/server/session";
import { accountsCapacity } from "@/server/services/capacity";
import { PageHeader } from "@/components/stat";
import { PurchaseSuggest } from "../tools";

export default async function PurchaseSuggestPage() {
  const user = await requirePageUser();
  const { avg, rows } = await accountsCapacity(user.id);
  const data = rows.map((r) => ({ id: r.id, label: r.label, program: r.program, programCode: r.programCode, holder: r.holder, cpfUsed: r.cpfUsed, cpfLimit: r.cpfLimit, load: r.load, costCpmCents: r.costCpmCents }));
  return (
    <>
      <PageHeader title="Sugestor de Compra" subtitle="Quanto comprar em cada conta para usar todos os CPFs livres, com custo, receita e lucro previstos" />
      <PurchaseSuggest rows={data} avgPtsPerCpf={avg.ptsPerCpf} saleCpmCents={avg.saleCpmCents} />
    </>
  );
}
