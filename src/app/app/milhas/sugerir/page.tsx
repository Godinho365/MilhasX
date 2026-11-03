import { requirePageUser } from "@/server/session";
import { accountsCapacity } from "@/server/services/capacity";
import { PageHeader } from "@/components/stat";
import { SuggestAccount } from "../tools";

export default async function SuggestAccountPage() {
  const user = await requirePageUser();
  const { avg, rows } = await accountsCapacity(user.id);
  const data = rows.map((r) => ({ id: r.id, label: r.label, program: r.program, programCode: r.programCode, holder: r.holder, cpfUsed: r.cpfUsed, cpfLimit: r.cpfLimit, load: r.load, costCpmCents: r.costCpmCents }));
  return (
    <>
      <PageHeader title="Sugerir Conta" subtitle="A melhor conta para uma emissão: saldo livre, CPFs livres e sem deixar milhas sem CPF" />
      <SuggestAccount rows={data} avgPtsPerCpf={avg.ptsPerCpf} />
    </>
  );
}
