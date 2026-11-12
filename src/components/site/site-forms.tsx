"use client";
// Formulários do site no visual do tema: "Pedir cotação" (vira pedido no CRM Passagens) e "Gestão de
// milhas" (vira interessado no CRM). Usam as mesmas APIs da Central de atendimento. Poucos campos
// obrigatórios, prova de privacidade e confirmação clara: o básico de formulário que converte.
import { useId, useState } from "react";
import { AIRPORTS, airportCodeOf } from "@/domain/airports";
import { readUtm } from "@/components/utm-keeper";
import type { SiteTheme } from "@/domain/site-themes";
import { btnStyle, inputStyle } from "./site-style";
import { WhatsappIcon } from "./site-icons";

const PROGRAMS = ["Smiles (Gol)", "LATAM Pass", "Azul Fidelidade", "Livelo", "Esfera", "TAP Miles&Go", "Outros"];

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{children}</span>;
}

function Done({ t, title, text, whatsapp }: { t: SiteTheme; title: string; text: string; whatsapp: string | null }) {
  return (
    <div role="status" style={{ textAlign: "center", padding: "28px 8px" }}>
      <p style={{ fontSize: 40, margin: 0 }} aria-hidden>✓</p>
      <p style={{ margin: "8px 0 0", fontSize: 20, fontWeight: 700 }}>{title}</p>
      <p style={{ margin: "8px 0 0", color: "var(--s-muted)" }}>{text}</p>
      {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle(t), marginTop: 18 }}><WhatsappIcon size={18} />Falar agora no WhatsApp</a>}
    </div>
  );
}

export function SiteQuoteForm({ t, slug, button, whatsapp, preview }: { t: SiteTheme; slug: string | null; button: string; whatsapp: string | null; preview: boolean }) {
  const listId = useId();
  const [f, setF] = useState({ name: "", phone: "", email: "", from: "", to: "", go: "", back: "", adults: "2", children: "0", notes: "", website: "" });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const inp = inputStyle(t);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !slug) return setErro("Prévia: o envio funciona no site publicado.");
    const origin = airportCodeOf(f.from), destination = airportCodeOf(f.to);
    if (!f.name.trim() || !f.phone.trim()) return setErro("Preencha seu nome e WhatsApp");
    if (!origin || !destination) return setErro("Escolha a cidade ou o aeroporto de origem e de destino");
    if (origin === destination) return setErro("Origem e destino precisam ser diferentes");
    setBusy(true);
    const round = !!f.back;
    const body = {
      customerName: f.name, customerPhone: f.phone, customerEmail: f.email || null, tripType: round ? "ROUND_TRIP" : "ONE_WAY", cabin: "ECONOMY",
      segments: [{ origin, destination, date: f.go || null }, ...(round ? [{ origin: destination, destination: origin, date: f.back }] : [])],
      adults: Math.min(9, Math.max(1, Number(f.adults) || 1)), children: Math.min(8, Math.max(0, Number(f.children) || 0)), infants: 0,
      flexibleDates: !f.go, notes: f.notes ? `Pelo site: ${f.notes}` : "Pedido feito pelo site", website: f.website, utm: readUtm(),
    };
    const r = await fetch(`/api/public/orders/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const j = (await r.json().catch(() => ({}))) as { number?: number; erro?: string };
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente pelo WhatsApp.");
    setDone(j.number ?? 0);
  }
  if (done !== null) return <Done t={t} title="Pedido recebido!" text={`Seu pedido${done ? ` nº ${done}` : ""} chegou para a nossa equipe. Vamos responder pelo WhatsApp.`} whatsapp={whatsapp} />;
  return (
    <form onSubmit={send} style={{ display: "grid", gap: 14 }} aria-label="Pedir cotação">
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label><Label>Seu nome *</Label><input style={inp} value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoComplete="name" /></label>
        <label><Label>WhatsApp *</Label><input style={inp} value={f.phone} onChange={(e) => set({ phone: e.target.value.replace(/[^\d\s()+-]/g, "") })} maxLength={30} inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" /></label>
        <label><Label>Saindo de *</Label><input style={inp} list={listId} value={f.from} onChange={(e) => set({ from: e.target.value })} placeholder="Cidade ou aeroporto" autoComplete="off" /></label>
        <label><Label>Para onde *</Label><input style={inp} list={listId} value={f.to} onChange={(e) => set({ to: e.target.value })} placeholder="Cidade ou aeroporto" autoComplete="off" /></label>
        <label><Label>Ida</Label><input style={inp} type="date" value={f.go} onChange={(e) => set({ go: e.target.value })} /></label>
        <label><Label>Volta (opcional)</Label><input style={inp} type="date" value={f.back} min={f.go || undefined} onChange={(e) => set({ back: e.target.value })} /></label>
        <label><Label>Adultos</Label><input style={inp} type="number" min={1} max={9} value={f.adults} onChange={(e) => set({ adults: e.target.value })} /></label>
        <label><Label>Crianças</Label><input style={inp} type="number" min={0} max={8} value={f.children} onChange={(e) => set({ children: e.target.value })} /></label>
      </div>
      <label><Label>E-mail (opcional)</Label><input style={inp} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} maxLength={200} autoComplete="email" /></label>
      <label><Label>Algo mais? (opcional)</Label><textarea style={{ ...inp, minHeight: 80 }} value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={1500} placeholder="Hotel, bagagem, orçamento, se as datas são flexíveis…" /></label>
      {/* campo-armadilha: pessoas não veem, robôs preenchem */}
      <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set({ website: e.target.value })} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />
      <datalist id={listId}>{AIRPORTS.map((a) => <option key={a.code} value={`${a.code} — ${a.city}`}>{a.name}</option>)}</datalist>
      {erro && <p role="alert" style={{ margin: 0, color: "#c0392b", fontWeight: 600 }}>{erro}</p>}
      <button type="submit" disabled={busy} style={{ ...btnStyle(t), border: 0, width: "100%", padding: "1rem", fontSize: 16, opacity: busy ? 0.7 : 1 }}>{busy ? "Enviando…" : button || "Receber minha cotação"}</button>
      <p style={{ margin: 0, fontSize: 12, color: "var(--s-muted)", textAlign: "center" }}>Sem compromisso. Usamos seus dados só para responder ao seu pedido.</p>
    </form>
  );
}

export function SiteMilesForm({ t, slug, button, whatsapp, preview }: { t: SiteTheme; slug: string | null; button: string; whatsapp: string | null; preview: boolean }) {
  const [f, setF] = useState({ name: "", phone: "", email: "", programs: [] as string[], website: "" });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const inp = inputStyle(t);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview || !slug) return setErro("Prévia: o envio funciona no site publicado.");
    if (!f.name.trim() || !f.phone.trim()) return setErro("Preencha seu nome e WhatsApp");
    setBusy(true);
    const r = await fetch(`/api/public/leads/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: f.name, phone: f.phone, email: f.email || null, programs: f.programs, message: "Interesse pelo site", website: f.website }) });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente pelo WhatsApp.");
    setDone(true);
  }
  if (done) return <Done t={t} title="Recebemos seu contato!" text="Vamos explicar como funciona a gestão de milhas pelo WhatsApp." whatsapp={whatsapp} />;
  const chip = (on: boolean): React.CSSProperties => ({ padding: "6px 12px", borderRadius: 999, border: "1px solid var(--s-line)", backgroundColor: on ? "var(--s-accent)" : "transparent", color: on ? "var(--s-on-accent)" : "inherit", fontSize: 13, cursor: "pointer" });
  return (
    <form onSubmit={send} style={{ display: "grid", gap: 14 }} aria-label="Interesse em gestão de milhas">
      <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <label><Label>Seu nome *</Label><input style={inp} value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} autoComplete="name" /></label>
        <label><Label>WhatsApp *</Label><input style={inp} value={f.phone} onChange={(e) => set({ phone: e.target.value.replace(/[^\d\s()+-]/g, "") })} maxLength={30} inputMode="tel" autoComplete="tel" placeholder="(11) 90000-0000" /></label>
        <label><Label>E-mail (opcional)</Label><input style={inp} type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} maxLength={200} autoComplete="email" /></label>
      </div>
      <div>
        <Label>Programas que você usa (opcional)</Label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{PROGRAMS.map((p) => { const on = f.programs.includes(p); return <button key={p} type="button" aria-pressed={on} style={chip(on)} onClick={() => set({ programs: on ? f.programs.filter((x) => x !== p) : [...f.programs, p] })}>{p}</button>; })}</div>
      </div>
      <input tabIndex={-1} autoComplete="off" value={f.website} onChange={(e) => set({ website: e.target.value })} style={{ position: "absolute", left: -9999, width: 1, height: 1, opacity: 0 }} aria-hidden />
      {erro && <p role="alert" style={{ margin: 0, color: "#c0392b", fontWeight: 600 }}>{erro}</p>}
      <button type="submit" disabled={busy} style={{ ...btnStyle(t), border: 0, width: "100%", padding: "1rem", fontSize: 16, opacity: busy ? 0.7 : 1 }}>{busy ? "Enviando…" : button || "Quero saber mais"}</button>
      <p style={{ margin: 0, fontSize: 12, color: "var(--s-muted)", textAlign: "center" }}>Usamos seus dados só para falar sobre o serviço.</p>
    </form>
  );
}
