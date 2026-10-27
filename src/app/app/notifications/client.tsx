"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";

export function MarkRead() {
  const router = useRouter();
  return (
    <button className="btn-ghost" onClick={async () => { await api("/api/notifications/read", "POST"); toast("Notificações marcadas como lidas"); refreshSafe(router); }}>
      <CheckCheck className="h-4 w-4" />Marcar todas como lidas
    </button>
  );
}
