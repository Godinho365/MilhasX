import { requirePageUser } from "@/server/session";
import { PageHeader } from "@/components/stat";

// Membro da equipe cuja função não abre nenhuma área (o dono ainda não liberou nada)
export default async function NoAccessPage() {
  const user = await requirePageUser();
  return (
    <>
      <PageHeader title="Sem acesso ainda" />
      <div className="card card-pad max-w-xl space-y-2 text-sm">
        <p>Olá, {user.actor.name}! Você entrou na equipe <b>{user.name}</b>, mas a sua função ainda não abre nenhuma área do app.</p>
        <p className="text-muted">Peça ao dono da conta para escolher a sua função em Equipe › Acesso. Assim que ele salvar, é só recarregar esta página.</p>
      </div>
    </>
  );
}
