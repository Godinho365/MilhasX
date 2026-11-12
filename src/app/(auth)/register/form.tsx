"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthTitle, GoogleButton, OrDivider, Turnstile } from "../parts";

/** (11) 98765-4321 enquanto digita; fixo de 10 dígitos fica (11) 3456-7890. */
export function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function RegisterForm({ google, siteKey, initialError }: { google: boolean; siteKey: string; initialError: string }) {
  const ready = useHydrated();
  const [erro, setErro] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const [phone, setPhone] = useState("");
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const verified = !siteKey || !!captcha;
  const canSubmit = ready && terms && verified;

  const ref = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("ref"));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (!terms) return setErro("Aceite os Termos de Serviço e a Política de Privacidade");
    setBusy(true);
    setErro("");
    const r = await api("/api/auth/register", "POST", {
      name: f.get("name"),
      email: f.get("email"),
      phone,
      password: f.get("password"),
      acceptTerms: true,
      captcha: captcha || undefined,
      ref: ref() || undefined,
    });
    setBusy(false);
    if (!r.ok) {
      // O token do Cloudflare vale uma vez: gera outro para a próxima tentativa
      setCaptcha("");
      setCaptchaKey((k) => k + 1);
      return setErro(r.erro);
    }
    window.location.href = "/app";
  }

  function googleSignup() {
    if (!terms) return setErro("Aceite os Termos de Serviço e a Política de Privacidade");
    const q = new URLSearchParams({ mode: "signup", terms: "1" });
    if (captcha) q.set("cf", captcha);
    const r = ref();
    if (r) q.set("ref", r);
    window.location.href = `/api/auth/google?${q}`;
  }

  return (
    <div>
      <AuthTitle title="Cadastrar" subtitle="Digite seus dados para criar sua conta" />
      <form onSubmit={submit} method="post" className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <label className="block">
          <span className="label">Nome</span>
          <input className="input" name="name" autoComplete="name" placeholder="Digite seu nome" required minLength={2} maxLength={100} />
        </label>
        <label className="block">
          <span className="label">E-mail</span>
          <input className="input" name="email" type="email" autoComplete="email" placeholder="Digite seu e-mail" required />
        </label>
        <label className="block">
          <span className="label">Telefone (WhatsApp)</span>
          <input
            className="input"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="(11) 98765-4321"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            pattern="\(\d{2}\) \d{4,5}-\d{4}"
            title="Informe DDD e número"
            required
          />
        </label>
        <label className="block">
          <span className="label">Senha</span>
          <input className="input" name="password" type="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" required minLength={8} maxLength={128} />
        </label>
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>
            Eu li e concordo com os <Link href="/termos" target="_blank" className="font-medium underline">Termos de Serviço</Link> e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium underline">Política de Privacidade</Link>.<span className="text-red-400"> *</span>
          </span>
        </label>
        {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} />}
        <button className="btn-primary h-10 w-full" disabled={busy || !canSubmit}>{busy ? "Criando conta…" : "Cadastrar com e-mail"}</button>
      </form>
      {google && (
        <div className="mt-4 space-y-4">
          <OrDivider />
          <GoogleButton label="Cadastrar com Google" disabled={!canSubmit} onClick={googleSignup} />
        </div>
      )}
      <p className="mt-5 text-center text-sm text-muted">
        Já tem uma conta? <Link href="/login" className="font-medium text-accent-light underline-offset-2 hover:underline">Entrar</Link>
      </p>
    </div>
  );
}
