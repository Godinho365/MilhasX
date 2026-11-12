"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/** Título + subtítulo do cartão, com a linha separadora embaixo. */
export function AuthTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5 border-b border-line pb-4 text-center">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}</p>
    </div>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-[11px] uppercase tracking-wide text-muted" aria-hidden>
      <span className="h-px flex-1 bg-line" />
      ou
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function GoogleButton({ label, onClick, disabled }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="btn-ghost h-10 w-full text-[15px]">
      <GoogleIcon />
      {label}
    </button>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptPromise: Promise<void> | null = null;
function loadTurnstile() {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Verificação "não sou robô" do Cloudflare Turnstile. Para gerar um token novo (eles valem uma vez só),
 * remonte o componente trocando a `key`.
 */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onToken);
  cb.current = onToken;
  useEffect(() => {
    let id: string | undefined;
    let alive = true;
    loadTurnstile()
      .then(() => {
        if (!alive || !box.current || !window.turnstile) return;
        const theme = document.documentElement.dataset.theme === "dark" ? "dark" : "light";
        id = window.turnstile.render(box.current, {
          sitekey: siteKey,
          language: "pt-br",
          theme,
          size: "flexible",
          callback: (t: string) => cb.current(t),
          "expired-callback": () => cb.current(""),
          "error-callback": () => cb.current(""),
        });
      })
      .catch(() => cb.current(""));
    return () => {
      alive = false;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [siteKey]);
  return <div ref={box} className="min-h-[65px]" />;
}

/** Campo de senha com rótulo e botão de olho para mostrar/esconder o que foi digitado. */
export function PasswordField({
  label,
  name,
  autoComplete,
  placeholder,
  minLength,
  value,
  onChange,
  error,
}: {
  label: string;
  name: string;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  minLength?: number;
  value?: string;
  onChange?: (v: string) => void;
  error?: string;
}) {
  const id = useId();
  const errId = `${id}-erro`;
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <div className="relative">
        <input
          id={id}
          className={`input pr-11 ${error ? "border-red-400/70 focus:border-red-400" : ""}`}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          placeholder={placeholder}
          required
          minLength={minLength}
          maxLength={128}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          {...(value !== undefined ? { value, onChange: (e: React.ChangeEvent<HTMLInputElement>) => onChange?.(e.target.value) } : {})}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-[10px] text-muted hover:text-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-label={visible ? "Esconder senha" : "Mostrar senha"}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      {error && <p id={errId} className="mt-1.5 text-xs text-red-400">{error}</p>}
    </div>
  );
}
