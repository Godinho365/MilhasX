import { requirePageUser } from "@/server/session";
import { listInterests } from "@/server/services/contacts";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/stat";
import { InterestsClient } from "./client";

export default async function InterestsPage({ searchParams }: { searchParams: Promise<{ status?: string; prioridade?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const [items, customers, programs] = await Promise.all([
    listInterests(user.id, { status: sp.status, priority: sp.prioridade }),
    prisma.customer.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.program.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Interesses de Viagem" subtitle="Destinos, época e prioridade dos clientes, e as ofertas enviadas, num lugar só" />
      <InterestsClient items={items} customers={customers} programs={programs.map((p) => p.name)} filters={{ status: sp.status ?? "", priority: sp.prioridade ?? "" }} />
    </>
  );
}
