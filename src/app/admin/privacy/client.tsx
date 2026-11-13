"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";

const LABELS = { NEW: "Novo", IN_PROGRESS: "Em andamento", DONE: "Concluído" } as const;

export function PrivacyStatus({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function change(next: string) {
    setBusy(true);
    const r = await api(`/api/admin/privacy/${id}`, "PATCH", { status: next });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast(`Pedido marcado como ${LABELS[next as keyof typeof LABELS].toLowerCase()}`);
    refreshSafe(router);
  }
  return (
    <select className="input h-8 w-40 py-0 text-xs" value={status} disabled={busy} onChange={(e) => change(e.target.value)} aria-label="Situação do pedido">
      {Object.entries(LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}
