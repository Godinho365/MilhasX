import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { PageHeader } from "@/components/stat";
import { Empty, Alert } from "@/components/ui";
import { telegramStatus, listTelegramAlerts, listTelegramDms } from "@/server/services/telegram";
import { emissionAccounts } from "@/server/services/capacity";
import { realtimeEnabled } from "@/server/realtime/upgrade";
import { ChatBalcoesClient } from "./client";

// Chat Balcões: uma aba por grupo de balcão conectado (Configurações › Telegram), com as mensagens e o envio, as
// conversas no privado abertas a partir dos grupos e a aba Alertas.
export default async function ChatBalcoesPage({ searchParams }: { searchParams: Promise<{ abrir?: string }> }) {
  const user = await requirePageUser();
  const sp = await searchParams; // ?abrir=<conversa no privado> (ex.: "Mandar mensagem" do CRM Milhas)
  // contas com saldo: o lucro de cada pedido (e da contraproposta) sai do custo da conta mais barata que consegue emitir
  const [st, alerts, dms, accounts] = await Promise.all([telegramStatus(user.id), listTelegramAlerts(user.id), listTelegramDms(user.id), emissionAccounts(user.id)]);
  // uma aba por grupo de balcão de cada conta conectada
  const chats = st.accounts
    .filter((a) => a.status === "ACTIVE")
    .flatMap((a) => a.groups.map((g) => ({ id: g.id, title: g.title, account: a.accountName ?? a.phone, clearedUpTo: g.clearedUpTo })));
  return (
    <>
      {/* com conversas, o título fica na lista de conversas (como num mensageiro) */}
      {(!st.enabled || chats.length === 0) && <PageHeader title="Chat Balcões" subtitle="As mensagens dos grupos dos balcões, com alertas" />}
      {!st.enabled ? (
        <Alert kind="info">O servidor ainda não está pronto para o Telegram (faltam TELEGRAM_API_ID, TELEGRAM_API_HASH ou CREDENTIALS_KEY).</Alert>
      ) : chats.length === 0 ? (
        <Empty title="Nenhum grupo conectado" icon={<MessagesSquare className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Conecte sua conta do Telegram e escolha o grupo do balcão. Cada grupo vira uma aba aqui.</p>
          <Link href="/app/settings?tab=telegram" className="btn-primary">Conectar o Telegram</Link>
        </Empty>
      ) : (
        <ChatBalcoesClient chats={chats} initialAlerts={alerts} initialDms={dms} accounts={accounts} openDmId={sp.abrir && dms.some((d) => d.id === sp.abrir) ? sp.abrir : null} realtime={realtimeEnabled()} />
      )}
    </>
  );
}
