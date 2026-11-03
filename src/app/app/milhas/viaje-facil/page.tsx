import { requirePageUser } from "@/server/session";
import { listViajeFacil } from "@/server/services/miles";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/stat";
import { ViajeFacilClient } from "./client";

export default async function ViajeFacilPage() {
  const user = await requirePageUser();
  const [data, customers] = await Promise.all([
    listViajeFacil(user.id),
    prisma.customer.findMany({ where: { userId: user.id }, select: { name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="ViajeFácil" subtitle="Reservas Smiles com prazo para quitar em milhas: veja o que vence e aja antes" />
      <ViajeFacilClient items={data.items} totals={data.totals} customers={customers.map((c) => c.name)} />
    </>
  );
}
