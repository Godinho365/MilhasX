import { requirePageUser } from "@/server/session";
import { listMembers, listProcesses } from "@/server/services/team";
import { PageHeader } from "@/components/stat";
import { ProcessesClient } from "./client";

export default async function ProcessesPage() {
  const user = await requirePageUser();
  const [processes, members] = await Promise.all([listProcesses(user.id), listMembers(user.id)]);
  return (
    <>
      <PageHeader title="Processos" subtitle="O passo a passo da operação (emitir, reembolsar, atender): cada uso vira tarefas para a equipe" />
      <ProcessesClient processes={processes} members={members.filter((m) => m.active)} />
    </>
  );
}
