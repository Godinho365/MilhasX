"use client";
import { useState } from "react";
import { Field, Alert } from "@/components/ui";
import { TripFields, emptyTrip, tripSegments, type Trip } from "@/components/trip-fields";

/** "Pedir cotação": vira um pedido em "Novos pedidos" no CRM de quem é dono da página. */
export function PublicOrderForm({ slug, submit = "Pedir cotação", thanks = "Pedido enviado! Em breve entraremos em contato com a sua cotação.", preview = false }: { slug: string; submit?: string; thanks?: string; preview?: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [trip, setTrip] = useState<Trip>(emptyTrip);
  const [returnDate, setReturnDate] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState(""); // armadilha para robôs (escondido)
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setDone(0); // prévia do editor: só mostra a confirmação
    if (!phone.trim() && !email.trim()) return setErro("Informe um WhatsApp ou e-mail para contato");
    setBusy(true);
    const r = await fetch(`/api/public/orders/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: name, customerPhone: phone || null, customerEmail: email || null, ...trip, segments: tripSegments(trip, returnDate || null), notes: notes || null, website }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    setDone(j.number);
  }
  if (done !== null) return <Alert kind="ok">{thanks}</Alert>;
  return (
    <form onSubmit={send} noValidate={preview} className="space-y-4" aria-label="Pedir cotação">
      {erro && <Alert>{erro}</Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Seu nome" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></Field>
        <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} autoComplete="tel" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></Field>
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
      <TripFields trip={trip} setTrip={setTrip} returnDate={returnDate} setReturnDate={setReturnDate} />
      <Field label="Observações"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Horários, companhias de preferência, bagagem..." /></Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Enviando…" : submit}</button>
      <p className="text-center text-xs text-muted">Seus dados são usados só para responder a este pedido.</p>
    </form>
  );
}
