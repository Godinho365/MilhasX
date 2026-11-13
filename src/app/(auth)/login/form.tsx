"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthTitle, GoogleButton, OrDivider, PasswordField } from "../parts";

export function LoginForm({ google, initialError }: { google: boolean; initialError: string }) {
  const ready = useHydrated();
  const [erro, setErro] = useState(initialError);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErro("");
    const r = await api("/api/auth/login", "POST", { email: f.get("email"), password: f.get("password") });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    const inv = new URLSearchParams(window.location.search).get("convite");
    window.location.href = inv ? `/presente/${encodeURIComponent(inv)}` : "/app";
  }
  return (
    <div>
      <AuthTitle title="Entrar" subtitle="Faça login na sua conta" />
      <form onSubmit={submit} method="post" className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <label className="block">
          <span className="label">E-mail</span>
          <input className="input" name="email" type="email" autoComplete="email" placeholder="Digite seu e-mail" required />
        </label>
        <div>
          <PasswordField label="Senha" name="password" autoComplete="current-password" placeholder="Digite sua senha" />
          <div className="mt-2 text-right text-sm">
            <Link href="/forgot-password" className="text-muted hover:text-accent-light">Esqueceu sua senha?</Link>
          </div>
        </div>
        <button className="btn-primary h-10 w-full" disabled={busy || !ready}>{busy ? "Entrando…" : "Entrar com e-mail"}</button>
      </form>
      {google && (
        <div className="mt-4 space-y-4">
          <OrDivider />
          <GoogleButton label="Continuar com Google" disabled={!ready} onClick={() => {
            const inv = new URLSearchParams(window.location.search).get("convite");
            window.location.href = `/api/auth/google?mode=signin${inv ? `&convite=${encodeURIComponent(inv)}` : ""}`;
          }} />
          <p className="text-center text-xs text-muted">
            Ao continuar com Google, você concorda com os <Link href="/termos" target="_blank" className="underline hover:text-accent-light">Termos de Serviço</Link> e a{" "}
            <Link href="/privacidade" target="_blank" className="underline hover:text-accent-light">Política de Privacidade</Link>.
          </p>
        </div>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        Ainda não tem uma conta? <Link href="/register" className="font-medium text-accent-light underline-offset-2 hover:underline">Cadastre-se</Link>
      </p>
    </div>
  );
}
