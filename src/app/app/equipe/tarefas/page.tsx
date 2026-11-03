import { requirePageUser } from "@/server/session";
import { listMembers, listTasks } from "@/server/services/team";
import { PageHeader } from "@/components/stat";
import { TasksBoard } from "./client";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ membro?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const [tasks, members] = await Promise.all([listTasks(user.id, sp.membro), listMembers(user.id)]);
  return (
    <>
      <PageHeader title="Tarefas" subtitle="O que a equipe precisa fazer: arraste os cartões entre as colunas" />
      <TasksBoard tasks={tasks} members={members.filter((m) => m.active)} memberId={sp.membro ?? ""} />
    </>
  );
}
