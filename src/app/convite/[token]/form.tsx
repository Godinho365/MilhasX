"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Field } from "@/components/ui";

/** Aceitar o convite: confirma o nome e cria a senha; entra direto na conta da agência. */
export function InviteForm({ token, invite }: { token: string; invite: { name: string; email: string; agency: string; role: string } }) {
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setErro("As senhas não conferem");
    setBusy(true);
    const r = await api(`/api/auth/invite/${encodeURIComponent(token)}`, "POST", { name: f.get("name"), password: f.get("password") });
    if (!r.ok) { setBusy(false); return setErro(r.erro); }
    window.location.assign("/app");
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1">
        <h1 className="text-lg font-semibold">Entrar na equipe {invite.agency}</h1>
        <p className="text-sm text-muted">Você foi convidado como <b className="text-zinc-200">{invite.role}</b>. Crie sua senha para entrar com o e-mail <b className="text-zinc-200">{invite.email}</b>.</p>
      </div>
      {erro && <Alert>{erro}</Alert>}
      <Field label="Seu nome"><input className="input" name="name" defaultValue={invite.name} required maxLength={120} autoComplete="name" /></Field>
      <Field label="Senha" hint="Pelo menos 8 caracteres"><input className="input" name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></Field>
      <Field label="Confirmar a senha"><input className="input" name="confirm" type="password" required minLength={8} maxLength={128} autoComplete="new-password" /></Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Entrando…" : "Criar senha e entrar"}</button>
    </form>
  );
}
