import { requirePageUser } from "@/server/session";
import { listMembers } from "@/server/services/team";
import { PageHeader } from "@/components/stat";
import { MembersClient } from "./client";

export default async function TeamPage() {
  const user = await requirePageUser();
  const members = await listMembers(user.id);
  return (
    <>
      <PageHeader title="Equipe" subtitle="As pessoas da sua operação: responsáveis pelas tarefas e pelas metas" />
      <MembersClient members={members} owner={{ name: user.name, email: user.email }} />
    </>
  );
}
