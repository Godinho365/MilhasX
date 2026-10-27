"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Field } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";

export function LoginForm() {
  const ready = useHydrated();
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErro("");
    const r = await api("/api/auth/login", "POST", { email: f.get("email"), password: f.get("password") });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    window.location.href = "/app";
  }
  return (
    <form onSubmit={submit} method="post" className="space-y-4">
      <h1 className="text-lg font-semibold">Entrar</h1>
      {erro && <Alert>{erro}</Alert>}
      <Field label="E-mail"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Senha"><input className="input" name="password" type="password" autoComplete="current-password" required /></Field>
      <button className="btn-primary w-full" disabled={busy || !ready}>{busy ? "Entrando…" : "Entrar"}</button>
      <div className="flex justify-between text-sm text-muted">
        <Link href="/forgot-password" className="hover:text-white">Esqueci a senha</Link>
        <Link href="/register" className="hover:text-white">Criar conta</Link>
      </div>
    </form>
  );
}
