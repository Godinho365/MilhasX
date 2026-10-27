"use client";
import { useState } from "react";
import {
  BadgeCheck, Briefcase, Calendar, Check, CheckCircle2, Copy, CreditCard, ExternalLink, FileDown, FileSignature, FileText, Info,
  Luggage, MessageCircle, Plane, RefreshCw, Search, ShieldCheck, ShoppingBag, User, Users,
} from "lucide-react";
import { Alert } from "@/components/ui";
import { fmtBRL } from "@/lib/format";
import { CABIN_LABELS, type Cabin } from "@/domain/flight-search";
import { airlineSite, cityOf, proposalCode, type Leg } from "@/domain/proposal";
import type { PageDesign } from "@/domain/page-design";
import type { PublicOrder } from "@/server/services/client-pages";
import { waLink } from "./central";

// Páginas do pedido que o cliente recebe por link: Cotação, Reserva confirmada e Termo de compra
// e venda. O editor usa as mesmas telas na prévia, com o pedido de exemplo abaixo.

export const SAMPLE_ORDER: PublicOrder = {
  number: 42, customerName: "Roberto Almeida", customerPhone: "11987654321", customerCpf: null, tripType: "ROUND_TRIP", cabin: "ECONOMY",
  segments: [{ origin: "GRU", destination: "LIS", date: "2027-03-10" }, { origin: "LIS", destination: "GRU", date: "2027-03-20" }],
  adults: 2, children: 0, infants: 0, locator: "MX7Q2K", clientNotes: "Bagagem de 23 kg incluída para os dois passageiros.",
  hasProposal: true,
  proposal: {
    legs: [
      { label: "Ida", origin: "GRU", destination: "LIS", date: "2027-03-10", departTime: "22:05", arriveTime: "11:20", arriveDayOffset: 1, duration: "9h 15m", airline: "TAP Air Portugal", flight: "TP092", stops: 0 },
      { label: "Volta", origin: "LIS", destination: "GRU", date: "2027-03-20", departTime: "12:40", arriveTime: "19:05", arriveDayOffset: 0, duration: "10h 25m", airline: "TAP Air Portugal", flight: "TP093", stops: 0 },
    ],
    baggage: { personal: 2, carryOn: 2, checked: 2 },
    pixCents: 438000, fullCents: 489000, cardInstallments: 10, cardTotalCents: 459000,
    change: "Remarcação e cancelamento conforme as regras da tarifa da companhia aérea.", payment: "Pix à vista ou cartão de crédito em até 10x.", notes: "Valores e disponibilidade podem mudar até a emissão.",
    sentAt: "2026-10-27T12:00:00.000Z",
  },
  reservation: { program: "TAP Miles&Go", airline: "TAP Air Portugal", lastName: "ALMEIDA", passengers: ["Roberto Almeida", "Mariana Almeida"] },
  files: [{ id: "f1", name: "comprovante-reserva.pdf" }],
  signed: null,
};

const cabin = (c: string) => CABIN_LABELS[c as Cabin] ?? c;
const pax = (o: PublicOrder) => [o.adults && `${o.adults} adulto${o.adults > 1 ? "s" : ""}`, o.children && `${o.children} criança${o.children > 1 ? "s" : ""}`, o.infants && `${o.infants} bebê${o.infants > 1 ? "s" : ""}`].filter(Boolean).join(", ");
const shortDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short", timeZone: "UTC" }).replace(".", "") : "");
const fullDate = (d: string | null) => (d ? d.split("-").reverse().join("/") : "");
const nights = (a: string | null, b: string | null) => (a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400_000) : null);
const legsOf = (o: PublicOrder): Leg[] =>
  o.proposal.legs.length ? o.proposal.legs : o.segments.map((s, i) => ({ label: o.tripType === "ROUND_TRIP" ? (i === 0 ? "Ida" : "Volta") : `Trecho ${i + 1}`, origin: s.origin, destination: s.destination, date: s.date, departTime: "", arriveTime: "", arriveDayOffset: 0, duration: "", airline: "", flight: "", stops: 0 }));

function CardTitle({ icon: Icon, children }: { icon: typeof Info; children: React.ReactNode }) {
  return <h2 className="mb-3 flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-accent" />{children}</h2>;
}
function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button type="button" className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-xs font-medium" onClick={() => navigator.clipboard.writeText(text).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }, () => null)} aria-label={`${label} ${text}`}>
      {ok ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Copy className="h-3.5 w-3.5" />}{ok ? "Copiado" : label}
    </button>
  );
}

/* ---------------- Acesso (4 últimos dígitos) ---------------- */

export function AccessGate({ slug, token, agency, what }: { slug: string; token: string; agency: string; what: string }) {
  const [digits, setDigits] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await fetch(`/api/public/order-access/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ digits }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível verificar. Tente de novo.");
    window.location.reload();
  }
  return (
    <div className="card mx-auto max-w-sm px-6 py-8 text-center">
      <ShieldCheck className="mx-auto h-10 w-10 text-accent" />
      <p className="mt-3 text-sm text-muted">{agency}</p>
      <h1 className="mt-1 text-xl font-bold">Confirme seus dados para ver {what}</h1>
      <p className="mt-1.5 text-sm text-muted">Por segurança, informe os 4 últimos dígitos do telefone cadastrado pela agência.</p>
      <form onSubmit={send} className="mt-5 space-y-3" aria-label="Confirmar acesso">
        {erro && <Alert>{erro}</Alert>}
        <label className="block text-left"><span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted">Últimos 4 dígitos do telefone</span>
          <input className="h-12 w-full rounded-xl border border-line bg-panel2 text-center text-2xl font-semibold tracking-[0.5em] focus:outline-none" value={digits} onChange={(e) => setDigits(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" autoComplete="off" required minLength={4} maxLength={4} aria-label="Últimos 4 dígitos do telefone" />
        </label>
        <button className="btn-primary h-11 w-full" disabled={busy || digits.length !== 4}>{busy ? "Verificando…" : `Ver ${what}`}</button>
      </form>
    </div>
  );
}

/* ---------------- Cotação ---------------- */

function LegCard({ l }: { l: Leg }) {
  return (
    <section className="card p-4" aria-label={`${l.label} ${l.origin} para ${l.destination}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Plane className="h-4 w-4 text-accent" />
        <span className="font-semibold">{l.label}</span>
        <span className="text-muted">{l.origin} → {l.destination}</span>
        {l.airline && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent">{l.stops === 0 ? "Direto" : `${l.stops} parada${l.stops > 1 ? "s" : ""}`}</span>}
        <span className="ml-auto text-xs text-muted">{shortDate(l.date)}</span>
      </div>
      <div className="rounded-xl bg-panel2 p-3">
        {(l.airline || l.flight) && (
          <p className="mb-2 flex items-center gap-2 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel"><Plane className="h-4 w-4 text-muted" /></span><span><span className="block font-semibold">{l.airline || "Companhia aérea"}</span>{l.flight && <span className="block text-xs text-muted">Voo {l.flight}</span>}</span></p>
        )}
        <div className="flex items-end justify-between gap-3">
          <div><p className="text-2xl font-bold tabular-nums">{l.departTime || "--:--"}</p><p className="text-xs font-semibold">{l.origin}</p><p className="text-xs text-muted">{cityOf(l.origin)}</p></div>
          <div className="flex-1 pb-5 text-center text-xs text-muted">{l.duration}<div className="mt-1 border-t border-dashed border-zinc-600" /></div>
          <div className="text-right"><p className="text-2xl font-bold tabular-nums">{l.arriveTime || "--:--"}{l.arriveDayOffset > 0 && <sup className="ml-0.5 text-xs text-amber-400">+{l.arriveDayOffset}</sup>}</p><p className="text-xs font-semibold">{l.destination}</p><p className="text-xs text-muted">{cityOf(l.destination)}</p></div>
        </div>
      </div>
    </section>
  );
}

export function CotacaoView({ agency, whatsapp, design, order }: { agency: string; whatsapp: string | null; design: PageDesign["cotacao"]; order: PublicOrder }) {
  const p = order.proposal;
  const legs = legsOf(order);
  const first = legs[0];
  const dest = first ? cityOf(first.destination) : "";
  const back = legs.length > 1 ? legs.at(-1) : null;
  const n = order.tripType === "ROUND_TRIP" ? nights(first?.date ?? null, back?.date ?? null) : null;
  const wa = waLink(whatsapp, `Olá! Quero seguir com a cotação ${proposalCode(order.number)}.`);
  const firstName = order.customerName.split(" ")[0];
  const info = [
    [User, "Cliente", order.customerName],
    [Calendar, "Datas", [fullDate(first?.date ?? null), back ? fullDate(back.date) : ""].filter(Boolean).join(" → ") || "A combinar"],
    [Users, "Passageiros", pax(order)],
    [Plane, "Viagem", `${order.tripType === "ROUND_TRIP" ? "Ida e volta" : order.tripType === "MULTI" ? "Múltiplos trechos" : "Só ida"}${n ? ` · ${n} noites` : ""}`],
  ] as const;
  return (
    <>
      <section className="overflow-hidden rounded-3xl p-5 text-[#fff] sm:p-6" style={{ backgroundColor: "rgb(var(--hero, 26 46 22))" }} aria-label="Resumo da cotação">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[rgb(var(--lime,141_230_112))] text-lg font-bold text-zinc-900">{agency.slice(0, 1).toUpperCase()}</span>
            <span><span className="block font-bold leading-tight">{agency}</span><span className="block text-xs text-[#fff]/60">Cotação de viagem</span></span>
          </div>
          <span className="rounded-full border border-[#fff]/20 px-2.5 py-1 font-mono text-xs">{proposalCode(order.number)}</span>
        </div>
        <p className="mt-6 text-sm text-[#fff]/70">Olá, {firstName}</p>
        <h1 className="text-3xl font-bold leading-tight">Sua viagem para <span className="text-[rgb(var(--lime,141_230_112))]">{dest}</span></h1>
        {design.text && <p className="mt-2 text-sm text-[#fff]/70">{design.text}{p.sentAt ? ` Emitida em ${new Date(p.sentAt).toLocaleDateString("pt-BR")}.` : ""}</p>}
        {first && (
          <div className="mt-6 flex items-center gap-3">
            <div><p className="text-3xl font-bold">{first.origin}</p><p className="text-xs text-[#fff]/60">{cityOf(first.origin)}</p></div>
            <div className="relative flex-1 border-t border-dashed border-[#fff]/30"><span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[rgb(var(--lime,141_230_112))] text-zinc-900"><Plane className="h-4 w-4" /></span></div>
            <div className="text-right"><p className="text-3xl font-bold">{first.destination}</p><p className="text-xs text-[#fff]/60">{dest}</p></div>
          </div>
        )}
        <dl className="mt-6 grid grid-cols-2 gap-2">
          {info.map(([Icon, k, v]) => (
            <div key={k} className="rounded-2xl bg-[#fff]/10 p-3"><dt className="flex items-center gap-1.5 text-xs text-[#fff]/60"><Icon className="h-3.5 w-3.5" />{k}</dt><dd className="mt-0.5 text-sm font-semibold">{v}</dd></div>
          ))}
        </dl>
      </section>

      <div className="mt-4 space-y-4">
        {legs.map((l, i) => <LegCard key={i} l={l} />)}

        <section className="card p-4" aria-label="Bagagem e passageiros">
          <CardTitle icon={Luggage}>Bagagem e passageiros</CardTitle>
          <p className="kicker mb-2">Bagagem</p>
          {[[ShoppingBag, "Bolsa ou mochila", p.baggage.personal], [Briefcase, "Mala de mão", p.baggage.carryOn], [Luggage, "Mala despachada", p.baggage.checked]].filter(([, , q]) => (q as number) > 0).map(([Icon, l, q]) => {
            const I = Icon as typeof Info;
            return <div key={l as string} className="mb-2 flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent"><I className="h-4 w-4" /></span><span className="flex-1">{l as string}</span><span className="font-semibold">{q as number}x</span></div>;
          })}
          <p className="kicker mb-2 mt-3">Passageiros</p>
          {[["Adultos", order.adults], ["Crianças", order.children], ["Bebês", order.infants]].filter(([, q]) => (q as number) > 0).map(([l, q]) => (
            <div key={l as string} className="mb-2 flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5 text-sm"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent"><User className="h-4 w-4" /></span><span className="flex-1">{l as string}</span><span className="font-semibold">{q as number}x</span></div>
          ))}
        </section>

        <section className="card p-4" aria-label="Condições">
          <CardTitle icon={Info}>Condições</CardTitle>
          {[[RefreshCw, "Remarcação e cancelamento", p.change], [CreditCard, "Pagamento", p.payment], [Info, "Observações", p.notes]].filter(([, , t]) => t).map(([Icon, k, t]) => {
            const I = Icon as typeof Info;
            return <div key={k as string} className="mb-2 flex gap-3 rounded-xl bg-panel2 p-3 text-sm"><I className="mt-0.5 h-4 w-4 shrink-0 text-accent" /><span><span className="block font-semibold">{k as string}</span><span className="text-muted">{t as string}</span></span></div>;
          })}
        </section>

        <section className="card p-4" aria-label="Como seguir">
          <CardTitle icon={CheckCircle2}>Como seguir</CardTitle>
          <ol className="space-y-3 text-sm">
            {[["Confirme com a agência", `Fale com ${agency} para garantir esta cotação.`], ["Envie os dados dos passageiros", "Nome completo, data de nascimento e documento de cada viajante."], ["Pagamento e emissão", "Combine a forma de pagamento e receba a confirmação da reserva."]].map(([t, d], i) => (
              <li key={t} className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-900">{i + 1}</span><span><span className="block font-semibold">{t}</span><span className="text-muted">{d}</span></span></li>
            ))}
          </ol>
        </section>

        <section className="card p-4" aria-label="Valor total">
          <p className="kicker">Valor total</p>
          {p.pixCents == null ? <p className="mt-1 text-sm text-muted">A agência vai informar o valor em breve.</p> : (
            <>
              {p.fullCents != null && p.fullCents > p.pixCents && <p className="mt-1 text-sm text-muted">De <s>{fmtBRL(p.fullCents)}</s> por</p>}
              <p className="text-3xl font-bold tabular-nums">{fmtBRL(p.pixCents)}</p>
              <p className="text-sm text-muted">No Pix · {pax(order)}</p>
              {p.cardInstallments && p.cardTotalCents != null && (
                <div className="mt-3 rounded-xl bg-panel2 p-3 text-sm"><p className="kicker mb-1">Outras formas de pagamento</p><p className="font-semibold">Cartão de crédito parcelado</p><p className="text-muted">{p.cardInstallments}x {fmtBRL(Math.round(p.cardTotalCents / p.cardInstallments))} · total {fmtBRL(p.cardTotalCents)}</p></div>
              )}
            </>
          )}
          {design.footer && <p className="mt-3 text-xs text-muted">{design.footer}</p>}
        </section>
      </div>

      {(wa || p.pixCents != null) && (
        <div className="fixed inset-x-0 bottom-3 z-20 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-zinc-900 p-3 text-[#fff] shadow-2xl sm:bottom-5" style={{ backgroundColor: "rgb(28 30 26)", width: "calc(100% - 1.5rem)" }}>
          <div className="min-w-0 flex-1">
            {p.fullCents != null && p.pixCents != null && p.fullCents > p.pixCents && <p className="text-xs text-[#fff]/60"><s>{fmtBRL(p.fullCents)}</s> · Valor total no Pix</p>}
            <p className="text-lg font-bold tabular-nums">{p.pixCents != null ? fmtBRL(p.pixCents) : "Valor a combinar"}</p>
          </div>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl bg-[rgb(var(--lime,141_230_112))] px-4 font-semibold text-zinc-900"><MessageCircle className="h-4 w-4" />{design.cta}</a>}
        </div>
      )}
    </>
  );
}

/* ---------------- Reserva confirmada ---------------- */

export function ReservaView({ agency, whatsapp, design, order, fileBase, links }: { agency: string; whatsapp: string | null; design: PageDesign["reserva"]; order: PublicOrder; fileBase: string | null; links: { cotacao: string | null; contrato: string | null } }) {
  const r = order.reservation;
  const legs = legsOf(order);
  const site = airlineSite(r.airline || legs[0]?.airline || "", r.program);
  const wa = waLink(whatsapp, `Olá! Tenho uma dúvida sobre a reserva ${order.locator ?? ""}.`);
  return (
    <div className="space-y-4">
      <section className="card p-5" aria-label="Reserva">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent"><BadgeCheck className="h-3.5 w-3.5" />{design.title}</span>
        <p className="kicker mt-4">Código de reserva</p>
        <div className="flex items-center gap-3"><h1 className="font-mono text-4xl font-bold tracking-wider">{order.locator || "—"}</h1>{order.locator && <CopyButton text={order.locator} />}</div>
        <p className="mt-1 text-sm text-muted">{[r.program && `Emitida em ${r.program}`, order.customerName].filter(Boolean).join(" · ")}</p>
        {design.text && <p className="mt-2 text-sm text-muted">{design.text}</p>}
      </section>

      {order.locator && (
        <section className="card p-5" aria-label="Acompanhar a reserva">
          <CardTitle icon={Search}>Acompanhar a reserva</CardTitle>
          {[["Código de reserva", order.locator], ["Sobrenome", r.lastName]].filter(([, v]) => v).map(([k, v]) => (
            <div key={k} className="mb-2 flex items-center justify-between rounded-xl bg-panel2 px-3 py-2.5"><span><span className="block text-xs text-muted">{k}</span><span className="font-semibold">{v}</span></span><CopyButton text={v} label="Copiar" /></div>
          ))}
          {site && <a href={site.url} target="_blank" rel="noopener noreferrer" className="btn-primary mt-2 h-11 w-full">Acompanhar no site da {site.name}<ExternalLink className="h-4 w-4" /></a>}
        </section>
      )}

      <section className="card p-5" aria-label="Voos">
        <CardTitle icon={Plane}>Voos</CardTitle>
        {legs.map((l, i) => (
          <div key={i} className={i ? "mt-4 border-t border-line pt-4" : ""}>
            <p className="mb-2 text-sm font-semibold">{l.label}</p>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3 text-sm">
              <span><span className="block text-lg font-bold">{l.origin}</span><span className="text-xs text-muted">{fullDate(l.date)}{l.departTime ? ` · ${l.departTime}` : ""}</span></span>
              <span className="text-center text-xs"><span className="block font-semibold">{[l.airline, l.flight].filter(Boolean).join(" ")}</span><span className="text-muted">{l.duration}</span></span>
              <span className="text-right"><span className="block text-lg font-bold">{l.destination}</span><span className="text-xs text-muted">{l.arriveTime}</span></span>
            </div>
          </div>
        ))}
      </section>

      {r.passengers.length > 0 && (
        <section className="card p-5" aria-label="Passageiros">
          <CardTitle icon={Users}>Passageiros</CardTitle>
          <ul className="space-y-2 text-sm">{r.passengers.map((p) => <li key={p} className="flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5"><User className="h-4 w-4 text-accent" />{p}</li>)}</ul>
        </section>
      )}

      <section className="card p-5" aria-label="Documentos">
        <CardTitle icon={FileText}>Documentos</CardTitle>
        <ul className="space-y-2 text-sm">
          {order.files.map((f) => <li key={f.id}><a href={fileBase ? `${fileBase}/${f.id}` : undefined} className="flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5"><FileDown className="h-4 w-4 text-accent" /><span><span className="block font-semibold">Comprovante</span><span className="text-xs text-muted">{f.name}</span></span></a></li>)}
          {links.contrato && <li><a href={links.contrato} className="flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5"><FileSignature className="h-4 w-4 text-accent" /><span><span className="block font-semibold">Termo de compra e venda</span><span className="text-xs text-muted">{order.signed ? "Assinado · ver" : "Aguardando sua assinatura"}</span></span></a></li>}
          {links.cotacao && <li><a href={links.cotacao} className="flex items-center gap-3 rounded-xl bg-panel2 px-3 py-2.5"><FileText className="h-4 w-4 text-accent" /><span><span className="block font-semibold">Cotação</span><span className="text-xs text-muted">Voos, bagagens e valores combinados</span></span></a></li>}
        </ul>
        {order.clientNotes && <p className="mt-3 whitespace-pre-line rounded-xl bg-accent-soft p-3 text-sm">{order.clientNotes}</p>}
      </section>

      {design.tips && <p className="whitespace-pre-line px-1 text-sm text-muted">{design.tips}</p>}
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary h-11 w-full"><MessageCircle className="h-4 w-4" />Falar com {agency}</a>}
    </div>
  );
}

/* ---------------- Termo de compra e venda ---------------- */

export function ContratoView({ slug, token, agency, design, order, text, preview = false }: { slug: string; token: string; agency: string; design: PageDesign["contrato"]; order: PublicOrder; text: string; preview?: boolean }) {
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState(order.customerCpf ?? "");
  const [birth, setBirth] = useState("");
  const [address, setAddress] = useState("");
  const [agree, setAgree] = useState(false);
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const legs = legsOf(order);
  const p = order.proposal;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setDone(true);
    if (!agree) return setErro("Marque que leu e concorda com o termo");
    setBusy(true);
    const r = await fetch(`/api/public/contract/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, cpf, birthDate: birth, address, accepted: true, website }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    window.location.reload();
  }
  const signed = order.signed;
  const field = "h-11 w-full rounded-xl border border-line bg-panel2 px-3 text-sm focus:outline-none";
  const lab = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted";
  return (
    <div className="space-y-4">
      <section className="card p-5" aria-label="Resumo do termo">
        <h1 className="text-xl font-bold">{design.title}</h1>
        <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${signed || done ? "bg-accent-soft text-accent" : "bg-amber-500/15 text-amber-400"}`}>{signed ? `Assinado em ${new Date(signed.at).toLocaleDateString("pt-BR")}` : done ? "Assinado" : "Aguardando assinatura"}</span>
        <dl className="mt-4 space-y-2 text-sm">
          {[["Agência", agency], ["Cliente", order.customerName], ["Trecho(s)", legs.map((l) => `${l.origin} → ${l.destination}${l.date ? ` (${fullDate(l.date)})` : ""}`).join(" · ")], ["Valor", p.pixCents != null ? fmtBRL(p.pixCents) : "—"], ["Forma de pagamento", p.pixCents != null ? "Pix" : p.payment]].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4"><dt className="text-muted">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>
          ))}
        </dl>
        {design.text && <p className="mt-3 text-sm text-muted">{design.text}</p>}
      </section>
      <section className="card max-h-[32rem] overflow-y-auto whitespace-pre-line p-5 text-sm leading-relaxed" aria-label="Termo" tabIndex={0}>{signed?.terms ?? text}</section>
      {signed || done ? (
        <div className="card p-5 text-center" role="status"><CheckCircle2 className="mx-auto h-10 w-10 text-green-400" /><p className="mt-2 font-semibold">{design.thanks}</p>{signed && <p className="mt-1 text-xs text-muted">Assinado por {signed.name} em {new Date(signed.at).toLocaleString("pt-BR")}. Data, hora e endereço IP foram registrados.</p>}</div>
      ) : (
        <form onSubmit={send} noValidate={preview} className="card space-y-3 p-5" aria-label="Assinar termo">
          <h2 className="font-semibold">Assinatura</h2>
          {erro && <Alert>{erro}</Alert>}
          <label className="block"><span className={lab}>Nome completo *</span><input className={field} value={name} onChange={(e) => setName(e.target.value)} required minLength={5} maxLength={120} autoComplete="name" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className={lab}>CPF *</span><input className={field} value={cpf} onChange={(e) => setCpf(e.target.value)} required inputMode="numeric" maxLength={14} placeholder="000.000.000-00" /></label>
            <label className="block"><span className={lab}>Data de nascimento *</span><input type="date" className={field} value={birth} onChange={(e) => setBirth(e.target.value)} required /></label>
          </div>
          <label className="block"><span className={lab}>Endereço *</span><input className={field} value={address} onChange={(e) => setAddress(e.target.value)} required maxLength={200} autoComplete="street-address" placeholder="Rua, número, cidade/UF" /></label>
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="checkbox mt-0.5" checked={agree} onChange={(e) => setAgree(e.target.checked)} />Li o termo acima e concordo com ele. Entendo que esta assinatura eletrônica tem validade jurídica.</label>
          <button className="btn-primary h-11 w-full" disabled={busy}>{busy ? "Enviando…" : design.submit}</button>
          <p className="text-xs text-muted">Registramos data, hora e endereço IP desta assinatura.</p>
        </form>
      )}
    </div>
  );
}
