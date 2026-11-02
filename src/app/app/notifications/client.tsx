"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { CheckCheck, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast, confirmDialog } from "@/components/feedback";

export function MarkRead() {
  const router = useRouter();
  return (
    <button className="btn-ghost" onClick={async () => { await api("/api/notifications/read", "POST"); toast("Notificações marcadas como lidas"); refreshSafe(router); }}>
      <CheckCheck className="h-4 w-4" />Marcar todas como lidas
    </button>
  );
}

export function ClearAll() {
  const router = useRouter();
  async function clear() {
    if (!(await confirmDialog({ title: "Limpar notificações?", body: "Todas as notificações saem da lista.", confirmLabel: "Limpar", danger: true }))) return;
    await api("/api/notifications/clear", "POST");
    toast("Notificações limpas");
    refreshSafe(router);
  }
  return (
    <button className="btn-ghost" onClick={clear}>
      <Trash2 className="h-4 w-4" />Limpar
    </button>
  );
}
