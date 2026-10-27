import { requirePageUser } from "@/server/session";
import { listOrders } from "@/server/services/orders";
import { PageHeader } from "@/components/stat";
import { BuscadorClient } from "./client";

export default async function BuscadorPage({ searchParams }: { searchParams: Promise<{ pedido?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams;
  const orders = (await listOrders(user.id)).map((o) => ({ id: o.id, number: o.number, customerName: o.customerName, route: o.route, tripType: o.tripType, cabin: o.cabin, segments: o.segments, adults: o.adults, children: o.children, infants: o.infants }));
  return (
    <>
      <PageHeader title="Buscador de Passagens" subtitle="Preencha uma vez e pesquise em vários programas de fidelidade ao mesmo tempo." />
      <BuscadorClient orders={orders} initialOrderId={orders.some((o) => o.id === sp.pedido) ? sp.pedido! : ""} />
    </>
  );
}
