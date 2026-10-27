"use client";
import { useState } from "react";
import { Plane, Wallet, MessageCircle, ChevronRight } from "lucide-react";
import { Field, Alert } from "@/components/ui";
import { PublicOrderForm } from "./order-form";

/** Ações da Central de Atendimento: pedir cotação, interesse em gestão de milhas e WhatsApp. */
export function CentralActions({ slug, acceptsOrders, acceptsLeads, whatsapp }: { slug: string; acceptsOrders: boolean; acceptsLeads: boolean; whatsapp: string | null }) {
  const [open, setOpen] = useState<"cotacao" | "gestao" | null>(null);
  const wa = whatsapp ? `https://wa.me/${whatsapp.length <= 11 ? `55${whatsapp}` : whatsapp}` : null;
  const card = "flex w-full items-center gap-4 rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-accent-light";
  const icon = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl";
  return (
    <div className="space-y-3">
      {acceptsOrders && (
        <div>
          <button type="button" className={card} onClick={() => setOpen(open === "cotacao" ? null : "cotacao")} aria-expanded={open === "cotacao"}>
            <span className={`${icon} bg-blue-500/15 text-blue-300`}><Plane className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">Pedir cotação de viagem</span><span className="block text-sm text-muted">Envie trecho, datas e passageiros para cotarmos com milhas</span></span>
            <ChevronRight className={`h-5 w-5 text-muted transition-transform ${open === "cotacao" ? "rotate-90" : ""}`} />
          </button>
          {open === "cotacao" && <div className="card card-pad mt-2"><PublicOrderForm slug={slug} /></div>}
        </div>
      )}
      {acceptsLeads && (
        <div>
          <button type="button" className={card} onClick={() => setOpen(open === "gestao" ? null : "gestao")} aria-expanded={open === "gestao"}>
            <span className={`${icon} bg-amber-500/15 text-amber-300`}><Wallet className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">Interesse em gestão de milhas</span><span className="block text-sm text-muted">Assessoria para acumular, multiplicar e emitir passagens</span></span>
            <ChevronRight className={`h-5 w-5 text-muted transition-transform ${open === "gestao" ? "rotate-90" : ""}`} />
          </button>
          {open === "gestao" && <div className="card card-pad mt-2"><LeadForm slug={slug} /></div>}
        </div>
      )}
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" className={card}>
          <span className={`${icon} bg-green-500/15 text-green-300`}><MessageCircle className="h-5 w-5" /></span>
          <span className="min-w-0 flex-1"><span className="block font-semibold">Falar no WhatsApp</span><span className="block text-sm text-muted">Tire dúvidas direto comigo pelo WhatsApp</span></span>
          <ChevronRight className="h-5 w-5 text-muted" />
        </a>
      )}
    </div>
  );
}

function LeadForm({ slug }: { slug: string }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim() && !email.trim()) return setErro("Informe um WhatsApp ou e-mail para contato");
    setBusy(true);
    const r = await fetch(`/api/public/leads/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone: phone || null, email: email || null, message: message || null, website }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    setDone(true);
  }
  if (done) return <Alert kind="ok">Recebemos seu interesse! Em breve entraremos em contato.</Alert>;
  return (
    <form onSubmit={send} className="space-y-3" aria-label="Interesse em gestão de milhas">
      {erro && <Alert>{erro}</Alert>}
      <Field label="Seu nome" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} autoComplete="tel" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></Field>
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
      <Field label="Conte um pouco (opcional)"><textarea className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="Quais cartões e programas você usa, objetivos de viagem…" /></Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Enviando…" : "Quero saber mais"}</button>
    </form>
  );
}
