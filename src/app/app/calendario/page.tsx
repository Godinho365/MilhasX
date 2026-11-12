import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { calendarEvents, feedStatus } from "@/server/services/calendar";
import { PageHeader } from "@/components/stat";
import { brDay } from "@/domain/brasilia";
import { can } from "@/domain/permissions";
import { isDay, viewRange, type CalView } from "@/domain/calendar";
import { CalendarClient } from "./client";

const VIEWS: CalView[] = ["mes", "semana", "dia", "lista"];

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ visao?: string; data?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const perms = user.actor.permissions;
  const today = brDay();
  const view: CalView = VIEWS.includes(sp.visao as CalView) ? (sp.visao as CalView) : "mes";
  const anchor = isDay(sp.data) ? sp.data : today;
  const [events, members, customers, feed] = await Promise.all([
    calendarEvents(user.id, viewRange(view, anchor), { perms }),
    prisma.teamMember.findMany({ where: { userId: user.id, active: true }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } }),
    can(perms, "contatos") || can(perms, "vendas") ? prisma.customer.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 2000 }) : [],
    user.actor.isOwner ? feedStatus(user.id) : null,
  ]);
  return (
    <>
      <PageHeader title="Calendário" subtitle="Embarques, check-ins, hospedagens, tarefas, aniversários, vencimentos e os seus eventos" />
      <CalendarClient
        initial={{ view, anchor, events }} today={today} members={members} customers={customers} me={user.actor.memberId}
        canEdit={can(perms, "calendario", "edit")} canTask={can(perms, "tarefas", "edit")} feed={feed}
      />
    </>
  );
}
