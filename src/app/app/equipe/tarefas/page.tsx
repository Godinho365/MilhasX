import { requirePageUser } from "@/server/session";
import { listBoards, listMembers, listTasks } from "@/server/services/team";
import { TasksBoard } from "./client";

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ quadro?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const boards = await listBoards(user.id);
  const board = boards.find((b) => b.id === sp.quadro) ?? boards[0]!;
  const [tasks, members] = await Promise.all([listTasks(user.id, { boardId: board.id }), listMembers(user.id)]);
  return <TasksBoard boards={boards} board={board} tasks={tasks} members={members.filter((m) => m.active)} owner={user.name} />;
}
