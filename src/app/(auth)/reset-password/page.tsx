"use client";
import Link from "next/link";
import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/api";
import { Alert, Field } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";

function ResetForm() {
  const ready = useHydrated();
  const token = useSearchParams().get("token") ?? "";
  const [erro, setErro] = useState("");
  const [done, setDone] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setErro("As senhas não conferem");
    const r = await api("/api/auth/reset", "POST", { token, password: f.get("password") });
    if (!r.ok) return setErro(r.erro);
    setDone(true);
  }
  if (done) return <div className="space-y-4"><Alert kind="ok">Senha redefinida.</Alert><Link className="btn-primary w-full" href="/login">Entrar</Link></div>;
  return (
    <form onSubmit={submit} method="post" className="space-y-4">
      <h1 className="text-lg font-semibold">Nova senha</h1>
      {!token && <Alert>Link inválido.</Alert>}
      {erro && <Alert>{erro}</Alert>}
      <Field label="Nova senha"><input className="input" name="password" type="password" required minLength={8} autoComplete="new-password" /></Field>
      <Field label="Confirmar"><input className="input" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></Field>
      <button className="btn-primary w-full" disabled={!token || !ready}>Salvar</button>
    </form>
  );
}

export default function ResetPage() {
  return <Suspense><ResetForm /></Suspense>;
}
