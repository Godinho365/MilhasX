import { requirePageUser } from "@/server/session";
import { listMembers, listProcesses } from "@/server/services/team";
import { aiEnabled } from "@/server/ai";
import { PageHeader } from "@/components/stat";
import { can } from "@/domain/permissions";
import { ProcessesClient } from "./client";

export default async function ProcessesPage({ searchParams }: { searchParams: Promise<{ processo?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const [processes, members] = await Promise.all([listProcesses(user.id), listMembers(user.id)]);
  return (
    <>
      <PageHeader title="Processos" subtitle="O fluxograma de cada processo da operação: etapas, decisões e quem faz. Pergunte à IA ou use para criar as tarefas." />
      <ProcessesClient
        processes={processes.map((p) => ({ id: p.id, title: p.title, description: p.description, flow: p.flow }))}
        members={members.filter((m) => m.active).map((m) => ({ id: m.id, name: m.name }))}
        canEdit={can(user.actor.permissions, "tarefas", "edit")}
        ai={{ enabled: aiEnabled(), owner: user.actor.isOwner }}
        initialId={sp.processo ?? null}
      />
    </>
  );
}
