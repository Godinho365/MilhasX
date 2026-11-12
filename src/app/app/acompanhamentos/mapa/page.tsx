import { requirePageUser } from "@/server/session";
import { trackingMap } from "@/server/services/tracking";
import { PageHeader } from "@/components/stat";
import { TravelMap } from "./client";

export default async function TravelMapPage() {
  const user = await requirePageUser();
  const { now, trips } = await trackingMap(user.id);
  return (
    <>
      <PageHeader title="Mapa de viagens" subtitle="Clientes em viagem agora, embarcando em até 48h ou retornando hoje. Clique em uma bolinha para ver a viagem completa." />
      <TravelMap now={now} trips={trips} />
    </>
  );
}
