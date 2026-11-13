"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { readUtm } from "@/components/utm-keeper";
import { Alert } from "@/components/ui";
import { useHydrated } from "@/lib/use-hydrated";
import { AuthTitle, GoogleButton, OrDivider, PasswordField, Turnstile } from "../parts";

/** (11) 98765-4321 enquanto digita; fixo de 10 dígitos fica (11) 3456-7890. */
export function maskPhone(raw: string) {
  const d = raw.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Só os dígitos, no máximo 6 (aceita colar "123 456" ou "123-456"). */
export const cleanCode = (raw: string) => raw.replace(/\D/g, "").slice(0, 6);

export function RegisterForm({ google, siteKey, initialError, codeRequired }: { google: boolean; siteKey: string; initialError: string; codeRequired: boolean }) {
  const ready = useHydrated();
  const [erro, setErro] = useState(initialError);
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<"dados" | "codigo">("dados");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // Só acusa a diferença depois que a confirmação tem o mesmo tamanho (não grita enquanto a pessoa digita)
  const mismatch = confirm.length > 0 && confirm.length >= password.length && confirm !== password;
  const [terms, setTerms] = useState(false);
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);
  const verified = !siteKey || !!captcha;
  const canSubmit = ready && terms && verified;

  const ref = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("ref"));
  const invite = () => (typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("convite"));

  // Contagem para liberar o "Reenviar código"
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  function resetCaptcha() {
    // O token da Cloudflare vale uma vez: gera outro para a próxima tentativa
    setCaptcha("");
    setCaptchaKey((k) => k + 1);
  }

  async function sendCode() {
    setBusy(true);
    setErro("");
    setInfo("");
    const r = await api<{ resendSeconds: number }>("/api/auth/register/code", "POST", { email, captcha: captcha || undefined });
    setBusy(false);
    resetCaptcha();
    if (!r.ok) {
      setErro(r.erro);
      return false;
    }
    setResendIn(r.data.resendSeconds);
    return true;
  }

  async function createAccount() {
    setBusy(true);
    setErro("");
    const r = await api("/api/auth/register", "POST", {
      name,
      email,
      phone,
      password,
      acceptTerms: true,
      captcha: codeRequired ? undefined : captcha || undefined,
      code: codeRequired ? code : undefined,
      ref: ref() || undefined,
      utm: readUtm(),
    });
    setBusy(false);
    if (!r.ok) {
      if (!codeRequired) resetCaptcha();
      return setErro(r.erro);
    }
    const inv = invite();
    window.location.href = inv ? `/presente/${encodeURIComponent(inv)}` : "/app";
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) return setErro("As senhas não conferem");
    if (!terms) return setErro("Aceite os Termos de Serviço e a Política de Privacidade");
    if (!codeRequired) return createAccount();
    if (await sendCode()) {
      setCode("");
      setStep("codigo");
    }
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (code.length !== 6) return setErro("Digite o código de 6 dígitos");
    await createAccount();
  }

  async function resend() {
    if (await sendCode()) {
      setCode("");
      setInfo("Enviamos um código novo. O anterior deixou de valer.");
    }
  }

  function googleSignup() {
    if (!terms) return setErro("Aceite os Termos de Serviço e a Política de Privacidade");
    const q = new URLSearchParams({ mode: "signup", terms: "1" });
    if (captcha) q.set("cf", captcha);
    const r = ref();
    if (r) q.set("ref", r);
    const inv = invite();
    if (inv) q.set("convite", inv);
    for (const [k, v] of Object.entries(readUtm() ?? {})) q.set(k, v);
    window.location.href = `/api/auth/google?${q}`;
  }

  if (step === "codigo") {
    return (
      <div>
        <AuthTitle title="Confirme seu e-mail" subtitle="Falta só um passo para criar sua conta" />
        <form onSubmit={submitCode} method="post" className="space-y-4">
          {erro && <Alert>{erro}</Alert>}
          {info && <Alert kind="ok">{info}</Alert>}
          <p className="text-sm text-muted">
            Enviamos um código de 6 dígitos para <strong className="break-all text-zinc-100">{email}</strong>. Ele vale por 10 minutos. Confira também a caixa de spam.
          </p>
          <label className="block">
            <span className="label">Código de verificação</span>
            <input
              className="input h-12 text-center font-mono text-2xl tracking-[0.5em]"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={7}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(cleanCode(e.target.value))}
              required
              autoFocus
            />
          </label>
          <button className="btn-primary h-10 w-full" disabled={busy || !ready || code.length !== 6}>{busy ? "Criando conta…" : "Confirmar e criar conta"}</button>
        </form>
        <div className="mt-5 space-y-3 border-t border-line pt-4 text-sm">
          {siteKey && resendIn <= 0 && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} />}
          <div className="flex items-center justify-between gap-3">
            <button type="button" className="text-muted hover:text-accent-light" onClick={() => { setStep("dados"); setErro(""); setInfo(""); }}>
              ← Alterar e-mail
            </button>
            <button
              type="button"
              className="font-medium text-accent-light disabled:font-normal disabled:text-muted"
              onClick={resend}
              disabled={busy || resendIn > 0 || (!!siteKey && !captcha)}
            >
              {resendIn > 0 ? `Reenviar código em ${resendIn}s` : "Reenviar código"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <AuthTitle title="Cadastrar" subtitle="Digite seus dados para criar sua conta" />
      <form onSubmit={submit} method="post" className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <label className="block">
          <span className="label">Nome</span>
          <input className="input" name="name" autoComplete="name" placeholder="Digite seu nome" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label">E-mail</span>
          <input className="input" name="email" type="email" autoComplete="email" placeholder="Digite seu e-mail" required maxLength={200} value={email} onChange={(e) => setEmail(e.target.value.trim())} />
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
        <PasswordField label="Senha" name="password" autoComplete="new-password" placeholder="Mínimo de 8 caracteres" minLength={8} value={password} onChange={setPassword} />
        <PasswordField
          label="Confirmar senha"
          name="confirm"
          autoComplete="new-password"
          placeholder="Repita a senha"
          minLength={8}
          value={confirm}
          onChange={setConfirm}
          error={mismatch ? "As senhas não conferem" : undefined}
        />
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[rgb(var(--accent))]" checked={terms} onChange={(e) => setTerms(e.target.checked)} required />
          <span>
            Eu li e concordo com os <Link href="/termos" target="_blank" className="font-medium underline">Termos de Serviço</Link> e a{" "}
            <Link href="/privacidade" target="_blank" className="font-medium underline">Política de Privacidade</Link>.<span className="text-red-400"> *</span>
          </span>
        </label>
        {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} />}
        <button className="btn-primary h-10 w-full" disabled={busy || !canSubmit}>{busy ? (codeRequired ? "Enviando código…" : "Criando conta…") : "Cadastrar com e-mail"}</button>
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
