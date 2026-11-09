import Link from "next/link";
import { MessagesSquare } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { PageHeader } from "@/components/stat";
import { Empty, Alert } from "@/components/ui";
import { telegramStatus, listTelegramAlerts } from "@/server/services/telegram";
import { ChatBalcoesClient } from "./client";

// Chat Balcões: uma aba por grupo de balcão conectado (Configurações › Telegram), com as mensagens, e a aba
// Alertas (palavras que destacam e avisam das mensagens).
export default async function ChatBalcoesPage() {
  const user = await requirePageUser();
  const [st, alerts] = await Promise.all([telegramStatus(user.id), listTelegramAlerts(user.id)]);
  const chats = st.accounts
    .filter((a) => a.status === "ACTIVE" && a.group)
    .map((a) => ({ id: a.id, title: a.group!.title, account: a.accountName ?? a.phone }));
  return (
    <>
      <PageHeader title="Chat Balcões" subtitle="As mensagens dos grupos dos balcões, com alertas" />
      {!st.enabled ? (
        <Alert kind="info">O servidor ainda não está pronto para o Telegram (faltam TELEGRAM_API_ID, TELEGRAM_API_HASH ou CREDENTIALS_KEY).</Alert>
      ) : chats.length === 0 ? (
        <Empty title="Nenhum grupo conectado" icon={<MessagesSquare className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Conecte sua conta do Telegram e escolha o grupo do balcão. Cada grupo vira uma aba aqui.</p>
          <Link href="/app/settings?tab=telegram" className="btn-primary">Conectar o Telegram</Link>
        </Empty>
      ) : (
        <ChatBalcoesClient chats={chats} initialAlerts={alerts} />
      )}
    </>
  );
}
