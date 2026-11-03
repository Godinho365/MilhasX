import { requirePageUser } from "@/server/session";
import { listPassengers } from "@/server/services/contacts";
import { prisma } from "@/server/db";
import { PageHeader } from "@/components/stat";
import { PassengersClient } from "./client";

export default async function PassengersPage({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const [data, customers] = await Promise.all([
    listPassengers(user.id, { q: sp.q }),
    prisma.customer.findMany({ where: { userId: user.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const filter = sp.filtro === "aniversario" ? "aniversario" : sp.filtro === "semana" ? "semana" : "todos";
  const items = filter === "aniversario" ? data.items.filter((i) => i.birthdayMonth) : filter === "semana" ? data.items.filter((i) => i.birthdaySoon) : data.items;
  return (
    <>
      <PageHeader title="Passageiros" subtitle="Quem viaja: CPF, nascimento, cliente que comprou e a última conta usada" />
      <PassengersClient items={items} totals={data.totals} customers={customers} q={sp.q ?? ""} filter={filter} />
    </>
  );
}
