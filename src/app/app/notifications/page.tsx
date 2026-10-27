import { Bell } from "lucide-react";
import { requirePageUser } from "@/server/session";
import { listNotifications } from "@/server/services/market";
import { PageHeader } from "@/components/stat";
import { Empty } from "@/components/ui";
import { MarkRead } from "./client";

export default async function NotificationsPage() {
  const user = await requirePageUser();
  const items = await listNotifications(user.id);
  return (
    <>
      <PageHeader title="Notificações" subtitle="Alertas de saldo e de ofertas">{items.some((n) => !n.readAt) && <MarkRead />}</PageHeader>
      {items.length === 0 ? <Empty title="Nenhuma notificação" icon={<Bell className="h-5 w-5" />} /> : (
        <ul className="card divide-y divide-line overflow-hidden">
          {items.map((n) => (
            <li key={n.id} className={`flex gap-3 px-5 py-4 ${n.readAt ? "" : "bg-accent-soft/20"}`}>
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-zinc-700" : "bg-accent-light"}`} aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold">{n.title}</p>
                <p className="text-sm text-zinc-300">{n.body}</p>
                <p className="mt-1 text-xs text-muted">{n.createdAt.toLocaleString("pt-BR")}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
