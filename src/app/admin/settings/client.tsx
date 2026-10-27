"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Field, Alert } from "@/components/ui";

export function SettingsForm(props: { registrationOpen: boolean; supportEmail: string; announcement: string }) {
  const [msg, setMsg] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  async function save(key: string, value: boolean | string) {
    const r = await api("/api/admin/settings", "PUT", { key, value });
    setMsg(r.ok ? { kind: "ok", text: "Parâmetro salvo" } : { kind: "error", text: r.erro });
  }
  return (
    <div className="card max-w-xl space-y-4 p-4">
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={props.registrationOpen} onChange={(e) => save("registrationOpen", e.target.checked)} /> Cadastro público aberto</label>
      <Field label="E-mail de suporte"><input className="input" defaultValue={props.supportEmail} onBlur={(e) => save("supportEmail", e.target.value)} /></Field>
      <Field label="Aviso geral (opcional)"><input className="input" defaultValue={props.announcement} onBlur={(e) => save("announcement", e.target.value)} /></Field>
    </div>
  );
}
