"use client";
import { useState } from "react";
import { CheckCircle2, FileDown, MessageCircle, Plane } from "lucide-react";
import { Field, Alert } from "@/components/ui";
import { fmtBRL, fmtDate, fmtPts } from "@/lib/format";
import { CABIN_LABELS, type Cabin } from "@/domain/flight-search";
import { whatsappLink } from "@/domain/orders";
import type { PageDesign } from "@/domain/page-design";

// Páginas que o cliente recebe por link: cotação, reserva confirmada, saldo da gestão de milhas e
// assinatura do contrato. O editor usa as mesmas telas na prévia, com dados de exemplo.

export type ClientOrder = {
  number: number;
  customerName: string;
  cabin: string;
  segments: { origin: string; destination: string; date: string | null }[];
  adults: number;
  children: number;
  infants: number;
  locator: string | null;
  clientNotes: string | null;
  quotes: { id: string; origin: string; destination: string; departDate: string; returnDate: string | null; cabin: string; adults: number; cashCents: number | null; taxesCents: number | null; notes: string | null }[];
  files: { id: string; name: string }[];
};
export type ClientBalances = { holderName: string; accounts: { id: string; program: string; color: string; balance: number }[] };

export const SAMPLE_ORDER: ClientOrder = {
  number: 42,
  customerName: "Maria Exemplo",
  cabin: "ECONOMY",
  segments: [{ origin: "GRU", destination: "LIS", date: "2027-03-10" }, { origin: "LIS", destination: "GRU", date: "2027-03-24" }],
  adults: 2, children: 0, infants: 0,
  locator: "ABC123",
  clientNotes: "Bagagem de 23 kg incluída para os dois passageiros.",
  quotes: [
    { id: "q1", origin: "GRU", destination: "LIS", departDate: "2027-03-10", returnDate: "2027-03-24", cabin: "ECONOMY", adults: 2, cashCents: 589000, taxesCents: 98000, notes: "Voo direto, bagagem incluída" },
    { id: "q2", origin: "GRU", destination: "LIS", departDate: "2027-03-11", returnDate: "2027-03-25", cabin: "ECONOMY", adults: 2, cashCents: 512000, taxesCents: 91000, notes: "1 conexão em Madri" },
  ],
  files: [{ id: "f1", name: "bilhete-ABC123.pdf" }],
};
export const SAMPLE_BALANCES: ClientBalances = {
  holderName: "Maria Exemplo",
  accounts: [
    { id: "a1", program: "Smiles", color: "#f97316", balance: 84500 },
    { id: "a2", program: "LATAM Pass", color: "#e11d48", balance: 31200 },
    { id: "a3", program: "Livelo", color: "#db2777", balance: 120000 },
  ],
};

const pax = (o: ClientOrder) => [o.adults && `${o.adults} adulto${o.adults > 1 ? "s" : ""}`, o.children && `${o.children} criança${o.children > 1 ? "s" : ""}`, o.infants && `${o.infants} bebê${o.infants > 1 ? "s" : ""}`].filter(Boolean).join(", ");
const cabin = (c: string) => CABIN_LABELS[c as Cabin] ?? c;

function Header({ kicker, title, text }: { kicker: string; title: string; text: string }) {
  return (
    <>
      <p className="kicker">{kicker}</p>
      <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
      {text && <p className="mt-2 whitespace-pre-line text-muted">{text}</p>}
    </>
  );
}

function Itinerary({ o }: { o: ClientOrder }) {
  return (
    <ul className="mt-6 space-y-2" aria-label="Trechos">
      {o.segments.map((s, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4">
          <Plane className="h-5 w-5 text-accent-light" />
          <span className="flex-1 font-semibold">{s.origin} → {s.destination}</span>
          {s.date && <span className="text-sm text-muted">{fmtDate(s.date)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function CotacaoView({ design, order, whatsapp }: { design: PageDesign["cotacao"]; order: ClientOrder; whatsapp: string | null }) {
  const wa = whatsappLink(whatsapp, `Olá! Quero aprovar a cotação do pedido #${order.number}.`);
  return (
    <>
      <Header kicker={`Pedido #${order.number} · ${order.customerName}`} title={design.title} text={design.text} />
      <p className="mt-4 text-sm text-muted">{pax(order)} · {cabin(order.cabin)}</p>
      {order.quotes.length === 0 ? <p className="mt-6 rounded-2xl border border-line bg-panel p-4 text-sm text-muted">As opções da sua cotação aparecem aqui assim que ficarem prontas.</p> : (
        <ol className="mt-6 space-y-3" aria-label="Opções da cotação">
          {order.quotes.map((q, i) => (
            <li key={q.id} className="rounded-2xl border border-line bg-panel p-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold">Opção {i + 1} · {q.origin} → {q.destination}</p>
                {q.cashCents != null && <p className="text-lg font-semibold tabular-nums">{fmtBRL(q.cashCents)}</p>}
              </div>
              <p className="text-sm text-muted">Ida {fmtDate(q.departDate)}{q.returnDate ? ` · volta ${fmtDate(q.returnDate)}` : ""} · {cabin(q.cabin)} · {q.adults} passageiro{q.adults > 1 ? "s" : ""}</p>
              {q.taxesCents != null && <p className="text-xs text-muted">Inclui taxas de {fmtBRL(q.taxesCents)}</p>}
              {q.notes && <p className="mt-1 text-sm">{q.notes}</p>}
            </li>
          ))}
        </ol>
      )}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary mt-6 w-full"><MessageCircle className="h-4 w-4" />{design.cta}</a>}
      {design.footer && <p className="mt-4 text-center text-xs text-muted">{design.footer}</p>}
    </>
  );
}

export function ReservaView({ design, order, fileBase }: { design: PageDesign["reserva"]; order: ClientOrder; fileBase: string | null }) {
  return (
    <>
      <Header kicker={`Pedido #${order.number} · ${order.customerName}`} title={design.title} text={design.text} />
      <div className="mt-6 rounded-2xl border border-line bg-panel p-5 text-center">
        <p className="kicker">Localizador</p>
        <p className="mt-1 font-mono text-3xl font-bold tracking-widest">{order.locator || "—"}</p>
        <p className="mt-1 text-sm text-muted">{pax(order)} · {cabin(order.cabin)}</p>
      </div>
      <Itinerary o={order} />
      {order.clientNotes && <p className="mt-4 whitespace-pre-line rounded-2xl border border-line bg-panel p-4 text-sm">{order.clientNotes}</p>}
      {order.files.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Documentos">
          {order.files.map((f) => <li key={f.id}><a href={fileBase ? `${fileBase}/${f.id}` : undefined} className="btn-ghost h-10 w-full justify-start"><FileDown className="h-4 w-4" />{f.name}</a></li>)}
        </ul>
      )}
      {design.tips && <p className="mt-6 whitespace-pre-line text-sm text-muted">{design.tips}</p>}
    </>
  );
}

export function GestaoMilhasView({ design, data }: { design: PageDesign["gestaoMilhas"]; data: ClientBalances }) {
  const total = data.accounts.reduce((t, a) => t + a.balance, 0);
  return (
    <>
      <Header kicker={data.holderName} title={design.title} text={design.text} />
      <div className="mt-6 rounded-2xl border border-line bg-panel p-5">
        <p className="kicker">Total</p>
        <p className="text-3xl font-semibold tabular-nums">{fmtPts(total)} <span className="text-base font-normal text-muted">pontos e milhas</span></p>
      </div>
      <ul className="mt-3 space-y-2" aria-label="Saldos">
        {data.accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 rounded-2xl border border-line bg-panel p-4">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color }} />
            <span className="flex-1 font-medium">{a.program}</span>
            <span className="font-semibold tabular-nums">{fmtPts(a.balance)}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ContratoView({ design, slug, preview = false }: { design: PageDesign["contrato"]; slug: string; preview?: boolean }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setDone(true);
    if (!agree) return setErro("Marque que leu e concorda com os termos");
    if (!phone.trim() && !email.trim()) return setErro("Informe um WhatsApp ou e-mail para contato");
    setBusy(true);
    const r = await fetch(`/api/public/contract/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, email: email || null, phone: phone || null, accepted: true, website }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    setDone(true);
  }
  return (
    <>
      <Header kicker="Assinatura de contrato" title={design.title} text={design.text} />
      <div className="mt-6 max-h-80 overflow-y-auto whitespace-pre-line rounded-2xl border border-line bg-panel p-4 text-sm" aria-label="Termos do contrato" tabIndex={0}>{design.terms}</div>
      {done ? <div className="mt-4"><Alert kind="ok"><CheckCircle2 className="mr-1 inline h-4 w-4" />{design.thanks}</Alert></div> : (
        <form onSubmit={send} noValidate={preview} className="mt-4 space-y-3" aria-label="Assinar contrato">
          {erro && <Alert>{erro}</Alert>}
          <Field label="Nome completo" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required minLength={3} maxLength={120} autoComplete="name" /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} autoComplete="tel" /></Field>
            <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></Field>
          </div>
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="checkbox mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />Li os termos acima e concordo com eles</label>
          <button className="btn-primary w-full" disabled={busy}>{busy ? "Enviando…" : design.submit}</button>
        </form>
      )}
    </>
  );
}
