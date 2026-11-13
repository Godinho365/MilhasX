"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";

export function RedeemButton({ code }: { code: string }) {
  const [busy, setBusy] = useState(false);
  async function redeem() {
    setBusy(true);
    const r = await api<{ label: string }>("/api/invites/redeem", "POST", { code });
    if (!r.ok) {
      setBusy(false);
      return toast(r.erro, "error");
    }
    toast(`Convite aplicado: ${r.data.label}`);
    window.location.href = "/app";
  }
  return <button className="btn-primary w-full" onClick={redeem} disabled={busy}>{busy ? "Aplicando…" : "Usar convite"}</button>;
}
