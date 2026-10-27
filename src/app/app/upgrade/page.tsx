import { requirePageUser } from "@/server/session";
import { PageHeader } from "@/components/stat";
import { billingState } from "@/server/services/settings";
import { UpgradeClient } from "./client";

export default async function UpgradePage() {
  const user = await requirePageUser();
  const state = await billingState(user.id);
  return (
    <>
      <PageHeader title="Escolha seu plano" subtitle={state.online ? "Sem fidelidade. Pagamento recorrente pelo Mercado Pago; cancele quando quiser." : "Sem fidelidade. A ativação é feita pela administração, sem cobrança automática."} />
      <UpgradeClient current={state.plan} currentInterval={state.interval} pending={state.request} online={state.online} hasSubscription={!!state.subscription} email={user.email} />
    </>
  );
}
