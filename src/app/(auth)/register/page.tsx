"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Field } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";

export default function RegisterPage() {
  const ready = useHydrated();
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) return setErro("As senhas não conferem");
    setBusy(true);
    setErro("");
    const r = await api("/api/auth/register", "POST", { name: f.get("name"), email: f.get("email"), password: f.get("password"), ref: new URLSearchParams(window.location.search).get("ref") || undefined });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    window.location.href = "/app";
  }
  return (
    <form onSubmit={submit} method="post" className="space-y-4">
      <h1 className="text-lg font-semibold">Criar conta</h1>
      {erro && <Alert>{erro}</Alert>}
      <Field label="Nome"><input className="input" name="name" autoComplete="name" required minLength={2} /></Field>
      <Field label="E-mail"><input className="input" name="email" type="email" autoComplete="email" required /></Field>
      <Field label="Senha" hint="Mínimo de 8 caracteres"><input className="input" name="password" type="password" autoComplete="new-password" required minLength={8} /></Field>
      <Field label="Confirmar senha"><input className="input" name="confirm" type="password" autoComplete="new-password" required minLength={8} /></Field>
      <button className="btn-primary w-full" disabled={busy || !ready}>{busy ? "Criando…" : "Criar conta"}</button>
      <p className="text-center text-sm text-muted">Já tem conta? <Link href="/login" className="text-accent">Entrar</Link></p>
    </form>
  );
}
