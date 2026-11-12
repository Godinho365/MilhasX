import { requirePageUser } from "@/server/session";
import { prisma } from "@/server/db";
import { overviewData } from "@/server/services/overview";
import { PageHeader } from "@/components/stat";
import { brDay } from "@/domain/brasilia";
import { allowed, pageRequirement } from "@/domain/permissions";
import { hiddenWidgets, visibleWidgets } from "@/domain/overview";
import { OverviewClient } from "./client";

const SHORTCUTS: [string, string][] = [
  ["/app/calendario", "Calendário"], ["/app/sales", "Vendas"], ["/app/crm", "CRM Passagens"], ["/app/crm-milhas", "CRM Milhas"],
  ["/app/chat-balcoes", "Chat Balcões"], ["/app/buscador", "Buscador"], ["/app/programs", "Central de Contas"], ["/app/financeiro", "Financeiro"],
  ["/app/equipe/tarefas", "Tarefas"], ["/app/equipe/metas", "Metas e comissões"], ["/app/contatos/passageiros", "Passageiros"], ["/app/metricas", "Métricas"],
];

export default async function OverviewPage() {
  const user = await requirePageUser();
  const perms = user.actor.permissions;
  const pref = await prisma.userPreference.findUnique({ where: { userId: user.actor.id }, select: { overviewWidgets: true } });
  const saved = pref?.overviewWidgets ?? [];
  const widgets = visibleWidgets(saved, perms);
  const [data, members] = await Promise.all([
    overviewData(user.id, widgets, { perms }),
    prisma.teamMember.findMany({ where: { userId: user.id, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const shortcuts = SHORTCUTS.filter(([href]) => allowed(pageRequirement(href), perms, user.actor.isOwner)).map(([href, label]) => ({ href, label }));
  const first = user.actor.name.split(/\s+/)[0];
  const today = new Date(`${brDay()}T12:00:00Z`).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <PageHeader title={`Olá, ${first}`} subtitle={`Visão geral · ${today}`} />
      <OverviewClient widgets={widgets} hidden={hiddenWidgets(saved, perms)} data={data} shortcuts={shortcuts} me={user.actor.memberId} members={members} />
    </>
  );
}
