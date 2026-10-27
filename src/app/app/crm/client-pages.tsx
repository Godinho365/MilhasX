"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Copy, ExternalLink, FileSignature, FileText, Plus, Ticket, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, parseBRLToCents } from "@/lib/format";
import { Field } from "@/components/ui";
import { toast } from "@/components/feedback";
import { EMPTY_PROPOSAL, type Leg, type Proposal, type Reservation } from "@/domain/proposal";

// CRM › pedido › "Para o cliente": monta a cotação e a reserva que o cliente vê por link, mostra o
// termo de compra e venda e copia os três links (cotação, reserva, termo).

type Info = { slug: string | null; token: string | null; locator: string | null; clientNotes: string | null; proposal: Proposal | null; reservation: Reservation | null; signed: { name: string; at: string } | null };
type Segment = { origin: string; destination: string; date: string | null };

const money = (c: number | null) => (c == null ? "" : (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }));
const emptyLeg = (i: number, s?: Segment): Leg => ({ label: i === 0 ? "Ida" : "Volta", origin: s?.origin ?? "", destination: s?.destination ?? "", date: s?.date ?? null, departTime: "", arriveTime: "", arriveDayOffset: 0, duration: "", airline: "", flight: "", stops: 0 });

export function ClientPages({ id, segments }: { id: string; segments: Segment[] }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState<"cotacao" | "reserva" | null>(null);
  const load = async () => {
    const r = await api<{ item: Info }>(`/api/orders/${id}/share`);
    if (r.ok) setInfo(r.data.item);
  };
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function copyLink(kind: "cotacao" | "reserva" | "contrato") {
    const r = await api<{ token: string; slug: string | null }>(`/api/orders/${id}/share`, "POST");
    if (!r.ok) return toast(r.erro, "error");
    if (!r.data.slug) return toast("Crie sua página em Configurações › Sua MilhasX primeiro", "error");
    const url = `${window.location.origin}/p/${r.data.slug}/${kind}/${r.data.token}`;
    await navigator.clipboard.writeText(url).catch(() => null);
    toast({ cotacao: "Link da cotação copiado", reserva: "Link da reserva copiado", contrato: "Link do termo copiado" }[kind]);
    load();
  }
  if (!info) return <section aria-label="Para o cliente" className="rounded-xl border border-line p-4 text-sm text-muted">Carregando…</section>;
  const p = info.proposal;
  return (
    <section aria-label="Para o cliente" className="rounded-xl border border-line p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="kicker flex-1">Para o cliente</h3>
        <Link href="/editor" className="btn-subtle h-8 text-xs">Personalizar páginas</Link>
      </div>
      <ul className="space-y-2 text-sm">
        <li className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
          <FileText className="h-4 w-4 text-muted" />
          <span className="min-w-0 flex-1"><span className="font-medium">Cotação</span> <span className="text-xs text-muted">{p ? `${p.legs.length} voo(s)${p.pixCents != null ? ` · ${fmtBRL(p.pixCents)} no Pix` : ""}` : "ainda não montada"}</span></span>
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setOpen(open === "cotacao" ? null : "cotacao")}>{p ? "Editar cotação" : "Montar cotação"}</button>
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => copyLink("cotacao")}><Copy className="h-3.5 w-3.5" />Copiar link da cotação</button>
        </li>
        {open === "cotacao" && <ProposalEditor id={id} segments={segments} initial={p} onSaved={() => { setOpen(null); load(); }} />}
        <li className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
          <Ticket className="h-4 w-4 text-muted" />
          <span className="min-w-0 flex-1"><span className="font-medium">Reserva</span> <span className="text-xs text-muted">{info.locator ? `localizador ${info.locator}` : "sem localizador"}</span></span>
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setOpen(open === "reserva" ? null : "reserva")}>Dados da reserva</button>
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => copyLink("reserva")}><Copy className="h-3.5 w-3.5" />Copiar link da reserva</button>
        </li>
        {open === "reserva" && <ReservationEditor id={id} info={info} onSaved={() => { setOpen(null); load(); }} />}
        <li className="flex flex-wrap items-center gap-2 rounded-lg border border-line px-3 py-2">
          <FileSignature className="h-4 w-4 text-muted" />
          <span className="min-w-0 flex-1"><span className="font-medium">Termo de compra e venda</span> <span className={`text-xs ${info.signed ? "text-green-400" : "text-muted"}`}>{info.signed ? `assinado por ${info.signed.name} em ${new Date(info.signed.at).toLocaleDateString("pt-BR")}` : "aguardando assinatura"}</span></span>
          {info.slug && info.token && <a href={`/p/${info.slug}/contrato/${info.token}`} target="_blank" rel="noopener" className="btn-ghost h-8 text-xs">Ver<ExternalLink className="h-3.5 w-3.5" /></a>}
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => copyLink("contrato")}><Copy className="h-3.5 w-3.5" />Copiar link do termo</button>
        </li>
      </ul>
      <p className="mt-2 text-xs text-muted">O cliente abre cada link e confirma os 4 últimos dígitos do telefone do pedido. Milhas, custos e anotações internas nunca aparecem para ele.</p>
    </section>
  );
}

function ProposalEditor({ id, segments, initial, onSaved }: { id: string; segments: Segment[]; initial: Proposal | null; onSaved: () => void }) {
  const [p, setP] = useState<Proposal>(() => initial ?? { ...EMPTY_PROPOSAL, legs: segments.map((s, i) => emptyLeg(i, s)) });
  const [pix, setPix] = useState(money(p.pixCents));
  const [full, setFull] = useState(money(p.fullCents));
  const [card, setCard] = useState(money(p.cardTotalCents));
  const [busy, setBusy] = useState(false);
  const setLeg = (i: number, patch: Partial<Leg>) => setP((x) => ({ ...x, legs: x.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));
  async function save() {
    setBusy(true);
    const body = { ...p, pixCents: parseBRLToCents(pix), fullCents: parseBRLToCents(full), cardTotalCents: parseBRLToCents(card), sentAt: new Date().toISOString() };
    const r = await api(`/api/orders/${id}/share`, "PATCH", { proposal: body });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast("Cotação salva");
    onSaved();
  }
  const input = "input h-9 text-sm";
  return (
    <li className="space-y-4 rounded-lg border border-accent-light/40 bg-panel2 p-3" aria-label="Montar cotação">
      {p.legs.map((l, i) => (
        <fieldset key={i} className="space-y-2 rounded-lg border border-line p-3">
          <legend className="flex w-full items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted">
            Voo {i + 1}
            <button type="button" className="ml-auto text-muted hover:text-zinc-100" onClick={() => setP((x) => ({ ...x, legs: x.legs.filter((_, j) => j !== i) }))} aria-label={`Remover voo ${i + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>
          </legend>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            <Field label="Rótulo"><input className={input} value={l.label} onChange={(e) => setLeg(i, { label: e.target.value })} maxLength={20} /></Field>
            <Field label="Origem"><input className={`${input} uppercase`} value={l.origin} onChange={(e) => setLeg(i, { origin: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} /></Field>
            <Field label="Destino"><input className={`${input} uppercase`} value={l.destination} onChange={(e) => setLeg(i, { destination: e.target.value.toUpperCase().slice(0, 3) })} maxLength={3} /></Field>
            <Field label="Data" className="col-span-3 sm:col-span-3"><input type="date" className={input} value={l.date ?? ""} onChange={(e) => setLeg(i, { date: e.target.value || null })} /></Field>
            <Field label="Companhia" className="col-span-2"><input className={input} value={l.airline} onChange={(e) => setLeg(i, { airline: e.target.value })} maxLength={40} placeholder="LATAM" /></Field>
            <Field label="Voo"><input className={input} value={l.flight} onChange={(e) => setLeg(i, { flight: e.target.value })} maxLength={12} placeholder="LA8190" /></Field>
            <Field label="Saída"><input type="time" className={input} value={l.departTime} onChange={(e) => setLeg(i, { departTime: e.target.value })} /></Field>
            <Field label="Chegada"><input type="time" className={input} value={l.arriveTime} onChange={(e) => setLeg(i, { arriveTime: e.target.value })} /></Field>
            <Field label="Duração"><input className={input} value={l.duration} onChange={(e) => setLeg(i, { duration: e.target.value })} maxLength={12} placeholder="8h 25m" /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" className="checkbox" checked={l.arriveDayOffset > 0} onChange={(e) => setLeg(i, { arriveDayOffset: e.target.checked ? 1 : 0 })} />Chega no dia seguinte</label>
            <label className="flex items-center gap-2">Paradas <select className="input h-8 w-16 py-0 text-xs" value={l.stops} onChange={(e) => setLeg(i, { stops: Number(e.target.value) })}>{[0, 1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>
          </div>
        </fieldset>
      ))}
      {p.legs.length < 6 && <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setP((x) => ({ ...x, legs: [...x.legs, emptyLeg(x.legs.length)] }))}><Plus className="h-3.5 w-3.5" />Adicionar voo</button>}
      <div className="grid grid-cols-3 gap-2">
        {([["personal", "Bolsa/mochila"], ["carryOn", "Mala de mão"], ["checked", "Mala despachada"]] as const).map(([k, l]) => (
          <Field key={k} label={l}><input type="number" min={0} max={9} className={input} value={p.baggage[k]} onChange={(e) => setP((x) => ({ ...x, baggage: { ...x.baggage, [k]: Math.max(0, Math.min(9, Number(e.target.value) || 0)) } }))} /></Field>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Valor no Pix (R$)"><input className={input} value={pix} onChange={(e) => setPix(e.target.value)} inputMode="decimal" placeholder="4.380,00" /></Field>
        <Field label="“De” riscado (R$)"><input className={input} value={full} onChange={(e) => setFull(e.target.value)} inputMode="decimal" placeholder="opcional" /></Field>
        <Field label="Parcelas no cartão"><input type="number" min={1} max={24} className={input} value={p.cardInstallments ?? ""} onChange={(e) => setP((x) => ({ ...x, cardInstallments: e.target.value ? Number(e.target.value) : null }))} placeholder="10" /></Field>
        <Field label="Total no cartão (R$)"><input className={input} value={card} onChange={(e) => setCard(e.target.value)} inputMode="decimal" placeholder="4.590,00" /></Field>
      </div>
      <Field label="Remarcação e cancelamento"><input className={input} value={p.change} onChange={(e) => setP((x) => ({ ...x, change: e.target.value }))} maxLength={300} /></Field>
      <Field label="Pagamento"><input className={input} value={p.payment} onChange={(e) => setP((x) => ({ ...x, payment: e.target.value }))} maxLength={300} /></Field>
      <Field label="Observações"><input className={input} value={p.notes} onChange={(e) => setP((x) => ({ ...x, notes: e.target.value }))} maxLength={500} /></Field>
      <button type="button" className="btn-primary h-9" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar cotação"}</button>
    </li>
  );
}

function ReservationEditor({ id, info, onSaved }: { id: string; info: Info; onSaved: () => void }) {
  const r = info.reservation;
  const [locator, setLocator] = useState(info.locator ?? "");
  const [program, setProgram] = useState(r?.program ?? "");
  const [airline, setAirline] = useState(r?.airline ?? "");
  const [lastName, setLastName] = useState(r?.lastName ?? "");
  const [passengers, setPassengers] = useState((r?.passengers ?? []).join("\n"));
  const [notes, setNotes] = useState(info.clientNotes ?? "");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const res = await api(`/api/orders/${id}/share`, "PATCH", {
      locator: locator || null,
      clientNotes: notes || null,
      reservation: { program, airline, lastName, passengers: passengers.split("\n").map((x) => x.trim()).filter(Boolean) },
    });
    setBusy(false);
    if (!res.ok) return toast(res.erro, "error");
    toast("Dados da reserva salvos");
    onSaved();
  }
  const input = "input h-9 text-sm";
  return (
    <li className="space-y-3 rounded-lg border border-accent-light/40 bg-panel2 p-3" aria-label="Dados da reserva">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label="Localizador"><input className={`${input} font-mono uppercase`} value={locator} onChange={(e) => setLocator(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())} maxLength={20} placeholder="ABC123" /></Field>
        <Field label="Emitida em (programa)"><input className={input} value={program} onChange={(e) => setProgram(e.target.value)} maxLength={40} placeholder="LATAM Pass" /></Field>
        <Field label="Companhia aérea"><input className={input} value={airline} onChange={(e) => setAirline(e.target.value)} maxLength={40} placeholder="LATAM" /></Field>
        <Field label="Sobrenome na reserva"><input className={`${input} uppercase`} value={lastName} onChange={(e) => setLastName(e.target.value)} maxLength={60} /></Field>
      </div>
      <Field label="Passageiros (um por linha)"><textarea className="input min-h-16 text-sm" value={passengers} onChange={(e) => setPassengers(e.target.value)} maxLength={1000} /></Field>
      <Field label="Recado na página da reserva"><input className={input} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Ex.: bagagem de 23 kg incluída" /></Field>
      <p className="text-xs text-muted">Os documentos marcados como “Visível” em Documentos aparecem na página da reserva.</p>
      <button type="button" className="btn-primary h-9" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar dados da reserva"}</button>
    </li>
  );
}
