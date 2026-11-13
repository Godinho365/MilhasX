"use client";
// Formulário do pedido de titular: envia pelo corpo da requisição (nada no endereço) e só mostra o protocolo.
import { useState } from "react";
import { api } from "@/lib/api";
import { Alert, Field } from "@/components/ui";
import { Turnstile } from "@/app/(auth)/parts";
import { PRIVACY_REQUEST_KINDS } from "@/domain/privacy";

export function PrivacyRequestForm({ siteKey }: { siteKey: string }) {
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [protocol, setProtocol] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setErro("");
    const r = await api<{ protocol: string }>("/api/public/privacy-requests", "POST", {
      name: String(f.get("name") ?? ""),
      email: String(f.get("email") ?? ""),
      kind: String(f.get("kind") ?? ""),
      message: String(f.get("message") ?? "") || null,
      website: String(f.get("website") ?? ""),
      captchaToken: captcha || null,
    });
    setBusy(false);
    if (!r.ok) {
      setErro(r.erro);
      setCaptcha("");
      setCaptchaKey((k) => k + 1); // o token do Turnstile vale uma vez só
      return;
    }
    setProtocol(r.data.protocol || "recebido");
  }

  if (protocol) {
    return (
      <div className="mt-4" role="status">
        <Alert kind="ok">
          Pedido registrado{protocol !== "recebido" ? <> com o protocolo <strong>{protocol}</strong></> : null}. Vamos responder pelo e-mail
          informado. Guarde o protocolo para acompanhar o pedido.
        </Alert>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4" aria-label="Pedido sobre dados pessoais">
      {erro && <Alert>{erro}</Alert>}
      <Field label="Seu nome" required><input className="input" name="name" required maxLength={120} autoComplete="name" /></Field>
      <Field label="E-mail para resposta" required hint="Use o e-mail ligado aos dados, se tiver conta"><input className="input" type="email" name="email" required maxLength={200} autoComplete="email" /></Field>
      <Field label="O que você quer pedir" required>
        <select className="input" name="kind" required defaultValue="">
          <option value="" disabled>Escolha</option>
          {PRIVACY_REQUEST_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </Field>
      <Field label="Detalhes (opcional)" hint="Não envie senhas nem documentos por aqui. Se precisarmos confirmar sua identidade, vamos pedir pelo e-mail.">
        <textarea className="input min-h-28" name="message" maxLength={2000} />
      </Field>
      {/* armadilha para robôs: invisível para pessoas */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      {siteKey && <Turnstile key={captchaKey} siteKey={siteKey} onToken={setCaptcha} />}
      <button className="btn-primary" disabled={busy || (!!siteKey && !captcha)}>{busy ? "Enviando…" : "Enviar pedido"}</button>
    </form>
  );
}
