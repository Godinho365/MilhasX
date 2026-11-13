"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { toast, confirmDialog } from "@/components/feedback";

/** Aprovar (ativa o plano pedido sem cobrança) ou recusar um pedido de plano. */
export function RequestActions({ userId, name, plan, interval }: { userId: string; name: string; plan: string; interval: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function approve() {
    setBusy(true);
    const r = await api(`/api/admin/users/${userId}/plan`, "PUT", { plan, interval: interval ?? "MENSAL" });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast(`Plano ativado para ${name}`);
    refreshSafe(router);
  }
  async function reject() {
    if (!(await confirmDialog({ title: `Recusar o pedido de ${name}?`, body: "O pedido some da fila e a pessoa continua no plano atual.", confirmLabel: "Recusar", danger: true }))) return;
    setBusy(true);
    const r = await api(`/api/admin/users/${userId}/plan`, "DELETE");
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast("Pedido recusado");
    refreshSafe(router);
  }
  return (
    <span className="inline-flex gap-1.5">
      <button className="btn-primary h-8 px-2.5 text-xs" disabled={busy} onClick={approve}><Check className="h-3.5 w-3.5" />Aprovar</button>
      <button className="btn-ghost h-8 px-2.5 text-xs text-red-400" disabled={busy} onClick={reject}><X className="h-3.5 w-3.5" />Recusar</button>
    </span>
  );
}
