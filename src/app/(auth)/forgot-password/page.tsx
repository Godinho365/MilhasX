"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Field } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";

export default function ForgotPage() {
  const ready = useHydrated();
  const [msg, setMsg] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const r = await api("/api/auth/forgot", "POST", { email: new FormData(e.currentTarget).get("email") });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setMsg(r.data.mensagem);
  }
  return (
    <form onSubmit={submit} method="post" className="space-y-4">
      <h1 className="text-lg font-semibold">Recuperar senha</h1>
      {msg && <Alert kind="ok">{msg}</Alert>}
      {erro && <Alert>{erro}</Alert>}
      <Field label="E-mail"><input className="input" name="email" type="email" required /></Field>
      <button className="btn-primary w-full" disabled={busy || !ready}>Enviar link</button>
      <p className="text-center text-sm"><Link href="/login" className="text-muted hover:text-white">Voltar ao login</Link></p>
    </form>
  );
}
