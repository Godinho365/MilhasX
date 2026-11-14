import { requirePageUser } from "@/server/session";
import { PageHeader } from "@/components/stat";
import { Alert } from "@/components/ui";
import { can } from "@/domain/permissions";
import { balcaoStatus } from "@/server/services/balcao";
import { realtimeEnabled } from "@/server/realtime/upgrade";
import { BalcaoClient } from "./client";

// Balcão MilhasX: as ofertas de compra do nosso balcão no Telegram, com a conta que emitiria e o lucro, e a proposta
// mandada daqui (escolhida pelo comprador, vira negociação no CRM Milhas). O vínculo é feito com o código do bot (/milhasx).
export default async function BalcaoMilhasXPage() {
  const user = await requirePageUser();
  const status = await balcaoStatus(user.id);
  const canEdit = user.actor.isOwner || can(user.actor.permissions, "chat", "edit");
  return (
    <>
      <PageHeader title="Balcão MilhasX" subtitle="Ofertas de compra do balcão, com a sua conta que emitiria e o lucro. Mande a proposta daqui." />
      {!status.enabled ? (
        <Alert kind="info">O servidor ainda não está ligado ao Balcão (faltam BALCAO_API_URL, BALCAO_API_SECRET ou CREDENTIALS_KEY).</Alert>
      ) : (
        <BalcaoClient initial={status} canEdit={canEdit} realtime={realtimeEnabled()} />
      )}
    </>
  );
}
