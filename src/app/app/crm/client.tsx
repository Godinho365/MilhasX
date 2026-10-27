"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Plane, Paperclip, MessageCircle, Archive, ArchiveRestore, Trash2, Pencil, Search, Users, Eye, EyeOff, Download } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { TripFields, emptyTrip, tripSegments, type Trip } from "@/components/trip-fields";
import { ORDER_STAGES, STAGE_LABELS, TRIP_LABELS, PRIORITY_LABELS, ARCHIVE_REASONS, WHATSAPP_TEMPLATES, whatsappText, whatsappLink, type OrderStageKey } from "@/domain/orders";
import { CABIN_LABELS } from "@/domain/flight-search";
import type { OrderView } from "@/server/services/orders";

type Customer = { id: string; name: string; phone: string | null; email: string | null };
const PRIORITY_CLS = { LOW: "bg-panel2 text-muted", MEDIUM: "bg-blue-500/15 text-blue-300", HIGH: "bg-red-500/15 text-red-300" } as const;

/* ---------------- Novo / editar pedido ---------------- */

export function OrderDialog({ order, customers, onClose }: { order: OrderView | null; customers: Customer[]; onClose: () => void }) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(order?.customerId ?? "");
  const [name, setName] = useState(order?.customerName ?? "");
  const [phone, setPhone] = useState(order?.customerPhone ?? "");
  const [email, setEmail] = useState(order?.customerEmail ?? "");
  const [trip, setTrip] = useState<Trip>(() =>
    order
      ? { tripType: order.tripType, cabin: order.cabin as Trip["cabin"], segments: order.tripType === "ROUND_TRIP" ? [order.segments[0]!] : order.segments, adults: order.adults, children: order.children, infants: order.infants, flexibleDates: order.flexibleDates, checkedBag: order.checkedBag }
      : emptyTrip(),
  );
  const [returnDate, setReturnDate] = useState(order?.tripType === "ROUND_TRIP" ? order.segments[1]?.date ?? "" : "");
  const [priority, setPriority] = useState(order?.priority ?? "MEDIUM");
  const [budget, setBudget] = useState(order?.budgetCents ? (order.budgetCents / 100).toFixed(2).replace(".", ",") : "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setName(c.name);
      setPhone(c.phone ?? "");
      setEmail(c.email ?? "");
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const budgetCents = budget.trim() ? parseBRLToCents(budget) : null;
    if (budget.trim() && budgetCents === null) return setErro("Orçamento inválido");
    setBusy(true);
    const body = { customerId: customerId || null, customerName: name, customerPhone: phone || null, customerEmail: email || null, ...trip, segments: tripSegments(trip, returnDate || null), priority, budgetCents, notes: notes || null };
    const r = order ? await api(`/api/orders/${order.id}`, "PUT", body) : await api("/api/orders", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(order ? "Pedido atualizado" : "Pedido criado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={order ? `Editar pedido ${order.number}` : "Novo pedido"} footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="order-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="order-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Cliente">
          <select className="input" value={customerId} onChange={(e) => pickCustomer(e.target.value)} aria-label="Cliente cadastrado">
            <option value="">Novo contato (digite abaixo)</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Nome" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
          <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} placeholder="(11) 90000-0000" /></Field>
          <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} /></Field>
        </div>
        <TripFields trip={trip} setTrip={setTrip} returnDate={returnDate} setReturnDate={setReturnDate} />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Prioridade">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITY_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Field>
          <Field label="Orçamento (R$)"><input className="input" inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="R$ 0,00" /></Field>
        </div>
        <Field label="Observações"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      </form>
    </Modal>
  );
}

/* ---------------- Kanban ---------------- */

function Card({ o, onOpen, onDragStart }: { o: OrderView; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  return (
    <li draggable onDragStart={onDragStart} className="cursor-grab rounded-xl border border-line bg-panel p-3 shadow-sm active:cursor-grabbing" aria-label={`Pedido ${o.number} de ${o.customerName}`}>
      <button type="button" onClick={onOpen} className="w-full text-left">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate font-semibold">{o.customerName}</p>
          <span className={`shrink-0 rounded px-1.5 text-[11px] font-medium ${PRIORITY_CLS[o.priority as keyof typeof PRIORITY_CLS] ?? ""}`}>{PRIORITY_LABELS[o.priority as keyof typeof PRIORITY_LABELS]}</span>
        </div>
        <p className="mt-1 text-xs text-muted">Pedido feito em: {fmtDate(o.createdAt)}</p>
        <p className="mt-1 text-xs text-muted">{TRIP_LABELS[o.tripType]}</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><Plane className="h-3.5 w-3.5 text-muted" />{o.route}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted">
          {o.source === "PUBLIC" && <span className="rounded bg-green-500/15 px-1.5 text-green-300">Página pública</span>}
          {o.budgetCents ? <span>{fmtBRL(o.budgetCents)}</span> : null}
          {o.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{o.attachments}</span>}
          {o.quotes > 0 && <span>{o.quotes} {o.quotes === 1 ? "cotação" : "cotações"}</span>}
        </div>
      </button>
    </li>
  );
}

export function Kanban({ orders, customers }: { orders: OrderView[]; customers: Customer[] }) {
  const router = useRouter();
  const [list, setList] = useState(orders);
  const [over, setOver] = useState<OrderStageKey | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const dragged = useRef<string | null>(null);
  useEffect(() => setList(orders), [orders]);
  useEffect(() => {
    const h = () => setCreating(true);
    window.addEventListener("mm:new-order", h);
    return () => window.removeEventListener("mm:new-order", h);
  }, []);

  async function move(id: string, stage: OrderStageKey, position?: number) {
    const prev = list;
    setList((l) => l.map((o) => (o.id === id ? { ...o, stage } : o)));
    const r = await api(`/api/orders/${id}/move`, "POST", { stage, position });
    if (!r.ok) {
      setList(prev);
      return toast(r.erro, "error");
    }
    refreshSafe(router);
  }
  function drop(e: React.DragEvent, stage: OrderStageKey) {
    e.preventDefault();
    setOver(null);
    const id = dragged.current ?? e.dataTransfer.getData("text/plain");
    dragged.current = null;
    if (id) move(id, stage, list.filter((o) => o.stage === stage && o.id !== id).length);
  }
  return (
    <>
      <div className="-mx-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
        <div className="flex min-w-max gap-3">
          {ORDER_STAGES.map((stage) => {
            const items = list.filter((o) => o.stage === stage);
            return (
              <section key={stage} aria-label={STAGE_LABELS[stage]} onDragOver={(e) => { e.preventDefault(); setOver(stage); }} onDragLeave={() => setOver((s) => (s === stage ? null : s))} onDrop={(e) => drop(e, stage)}
                className={`flex w-72 shrink-0 flex-col rounded-2xl border p-2 ${over === stage ? "border-accent-light bg-accent-soft/40" : "border-line bg-panel2/40"}`}>
                <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">{STAGE_LABELS[stage]}<span className="rounded-full bg-panel px-2 text-xs text-muted">{items.length}</span></h2>
                <ul className="flex-1 space-y-2 p-1" role="list">
                  {items.map((o) => <Card key={o.id} o={o} onOpen={() => setOpen(o.id)} onDragStart={(e) => { dragged.current = o.id; e.dataTransfer.setData("text/plain", o.id); }} />)}
                  {items.length === 0 && <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Nenhum pedido aqui ainda.</li>}
                </ul>
                {stage === "NEW" && <button type="button" className="btn-subtle mt-1 h-9 w-full text-sm" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Adicionar pedido</button>}
              </section>
            );
          })}
        </div>
      </div>
      {creating && <OrderDialog order={null} customers={customers} onClose={() => setCreating(false)} />}
      {open && <OrderDetails id={open} customers={customers} onClose={() => setOpen(null)} onMove={(stage) => move(open, stage)} />}
    </>
  );
}

/* ---------------- Lista ---------------- */

export function OrdersList({ active, archived, customers }: { active: OrderView[]; archived: OrderView[]; customers: Customer[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const h = () => setCreating(true);
    window.addEventListener("mm:new-order", h);
    return () => window.removeEventListener("mm:new-order", h);
  }, []);
  const table = (rows: OrderView[], empty: string) =>
    rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p> : (
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Pedido</th><th>Cliente</th><th>Viagem</th><th className="hidden md:table-cell">Etapa</th><th className="hidden sm:table-cell">Prioridade</th><th className="hidden text-right lg:table-cell">Orçamento</th><th className="hidden lg:table-cell">Criado</th></tr></thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="cursor-pointer hover:bg-panel2/50" onClick={() => setOpen(o.id)}>
                <td className="tabular-nums">#{o.number}</td>
                <td className="font-semibold">{o.customerName}</td>
                <td>{o.route}</td>
                <td className="hidden md:table-cell">{o.archivedAt ? <span className="text-muted">Arquivado: {o.archiveReason}</span> : STAGE_LABELS[o.stage]}</td>
                <td className="hidden sm:table-cell">{PRIORITY_LABELS[o.priority as keyof typeof PRIORITY_LABELS]}</td>
                <td className="hidden text-right tabular-nums lg:table-cell">{o.budgetCents ? fmtBRL(o.budgetCents) : "-"}</td>
                <td className="hidden text-muted lg:table-cell">{fmtDate(o.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="space-y-4">
      <section className="card overflow-hidden" aria-label="Pedidos ativos"><h2 className="border-b border-line px-5 py-3 font-semibold">Pedidos ativos <span className="text-muted">{active.length}</span></h2>{table(active, "Nenhum pedido ativo.")}</section>
      <section className="card overflow-hidden" aria-label="Pedidos arquivados"><h2 className="border-b border-line px-5 py-3 font-semibold">Pedidos arquivados <span className="text-muted">{archived.length}</span></h2>{table(archived, "Nenhum pedido arquivado.")}</section>
      {creating && <OrderDialog order={null} customers={customers} onClose={() => setCreating(false)} />}
      {open && <OrderDetails id={open} customers={customers} onClose={() => setOpen(null)} onMove={async (stage) => { const r = await api(`/api/orders/${open}/move`, "POST", { stage }); if (!r.ok) return toast(r.erro, "error"); refreshSafe(router); }} />}
    </div>
  );
}

/* ---------------- Detalhe do pedido ---------------- */

type Detail = OrderView & { events: { id: string; type: string; fromStage: string | null; toStage: string | null; note: string | null; createdAt: string }[] };
type FileRow = { id: string; name: string; mime: string; size: number; visibleToClient: boolean };
type Quote = { id: string; label: string; miles: number | null; taxesCents: number | null; cashCents: number | null; departDate: string; notes: string | null };

function OrderDetails({ id, customers, onClose, onMove }: { id: string; customers: Customer[]; onClose: () => void; onMove: (stage: OrderStageKey) => void | Promise<void> }) {
  const router = useRouter();
  const [o, setO] = useState<Detail | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState<string>(ARCHIVE_REASONS[0]);
  const [archiving, setArchiving] = useState(false);
  const load = async () => {
    const [a, f, q] = await Promise.all([api<{ item: Detail }>(`/api/orders/${id}`), api<{ items: FileRow[] }>(`/api/orders/${id}/files`), api<{ items: Quote[] }>(`/api/quotes?orderId=${id}`)]);
    if (a.ok) setO(a.data.item);
    if (f.ok) setFiles(f.data.items);
    if (q.ok) setQuotes(q.data.items);
  };
  useEffect(() => {
    load();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function stage(s: OrderStageKey) {
    await onMove(s);
    await load();
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const r = await fetch(`/api/orders/${id}/files`, { method: "POST", headers: { "x-file-name": encodeURIComponent(file.name) }, body: file });
    const j = await r.json().catch(() => ({ erro: "Falha no envio" }));
    if (!r.ok) return toast(j.erro ?? "Falha no envio", "error");
    toast("Documento anexado");
    load();
  }
  async function toggleVisible(f: FileRow) {
    const r = await api(`/api/orders/${id}/files/${f.id}`, "PATCH", { visibleToClient: !f.visibleToClient });
    if (!r.ok) return toast(r.erro, "error");
    load();
  }
  async function removeFile(f: FileRow) {
    if (!(await confirmDialog({ title: `Excluir ${f.name}?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/orders/${id}/files/${f.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    load();
  }
  async function archive() {
    const r = o?.archivedAt ? await api(`/api/orders/${id}/archive`, "DELETE") : await api(`/api/orders/${id}/archive`, "POST", { reason });
    if (!r.ok) return toast(r.erro, "error");
    toast(o?.archivedAt ? "Pedido desarquivado" : "Pedido arquivado");
    onClose();
    refreshSafe(router);
  }
  async function remove() {
    if (!(await confirmDialog({ title: `Excluir o pedido ${o?.number}?`, body: "Os documentos anexados também são excluídos.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/orders/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Pedido excluído");
    onClose();
    refreshSafe(router);
  }
  if (editing && o) return <OrderDialog order={o} customers={customers} onClose={() => { setEditing(false); load(); }} />;

  return (
    <Modal open onClose={onClose} size="lg" title={o ? `Pedido ${o.number}` : "Pedido"}>
      {!o ? <p className="py-10 text-center text-sm text-muted">Carregando…</p> : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-start gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-lg font-semibold">{o.customerName}</p>
              <p className="text-sm text-muted">{TRIP_LABELS[o.tripType]} · ×{o.adults + o.children + o.infants} · {CABIN_LABELS[o.cabin as keyof typeof CABIN_LABELS]}{o.customerPhone ? ` · ${o.customerPhone}` : ""}{o.customerEmail ? ` · ${o.customerEmail}` : ""}</p>
              <p className="mt-1 flex items-center gap-1.5 font-medium"><Plane className="h-4 w-4 text-muted" />{o.route}</p>
            </div>
            <button className="btn-ghost h-9" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar</button>
            <Link href={`/app/buscador?pedido=${o.id}`} className="btn-primary h-9"><Search className="h-4 w-4" />Buscar passagens</Link>
          </div>

          {!o.archivedAt && (
            <nav aria-label="Etapa do pedido" className="flex flex-wrap gap-1.5">
              {ORDER_STAGES.map((s) => (
                <button key={s} type="button" aria-pressed={o.stage === s} onClick={() => stage(s)} className={`rounded-full border px-3 py-1 text-xs font-medium ${o.stage === s ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{STAGE_LABELS[s]}</button>
              ))}
            </nav>
          )}
          {o.archivedAt && <Alert kind="info">Arquivado em {fmtDate(o.archivedAt)}: {o.archiveReason}</Alert>}

          <section aria-label="Detalhes do pedido" className="grid gap-3 rounded-xl border border-line p-4 text-sm sm:grid-cols-2">
            {o.segments.map((s, i) => <p key={i}><span className="text-muted">Trecho {i + 1}:</span> {s.origin} → {s.destination}{s.date ? ` · ${fmtDate(s.date)}` : ""}</p>)}
            <p><span className="text-muted">Passageiros:</span> {o.adults} adulto(s), {o.children} criança(s), {o.infants} bebê(s)</p>
            <p><span className="text-muted">Prioridade:</span> {PRIORITY_LABELS[o.priority as keyof typeof PRIORITY_LABELS]}</p>
            {o.budgetCents ? <p><span className="text-muted">Orçamento:</span> {fmtBRL(o.budgetCents)}</p> : null}
            <p><span className="text-muted">Datas flexíveis:</span> {o.flexibleDates ? "sim" : "não"} · <span className="text-muted">Bagagem:</span> {o.checkedBag ? "sim" : "não"}</p>
            {o.notes && <p className="whitespace-pre-line sm:col-span-2"><span className="text-muted">Observações:</span> {o.notes}</p>}
          </section>

          <section aria-label="Cotações">
            <h3 className="kicker mb-2">Cotações</h3>
            {quotes.length === 0 ? <p className="text-sm text-muted">Nenhuma cotação ainda. Use “Buscar passagens” e anote o que encontrar.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line text-sm">
                {quotes.map((q) => (
                  <li key={q.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
                    <span className="min-w-0 flex-1 font-medium">{q.label} <span className="text-xs text-muted">· {fmtDate(q.departDate)}</span></span>
                    {q.miles ? <span className="tabular-nums">{q.miles.toLocaleString("pt-BR")} milhas{q.taxesCents ? ` + ${fmtBRL(q.taxesCents)}` : ""}</span> : null}
                    {q.cashCents ? <span className="tabular-nums text-muted">{fmtBRL(q.cashCents)}</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Documentos">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="kicker">Documentos</h3>
              <label className="btn-ghost h-8 cursor-pointer text-xs"><Paperclip className="h-3.5 w-3.5" />Anexar documento<input type="file" className="sr-only" accept="image/*,application/pdf,.heic" onChange={upload} aria-label="Anexar documento" /></label>
            </div>
            <p className="mb-2 text-xs text-muted">{files.length} {files.length === 1 ? "documento anexado" : "documentos anexados"} · {files.filter((f) => f.visibleToClient).length} visíveis ao cliente</p>
            <ul className="space-y-1.5">
              {files.map((f) => (
                <li key={f.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                  <a href={`/api/orders/${id}/files/${f.id}`} className="min-w-0 flex-1 truncate hover:underline"><Download className="mr-1.5 inline h-3.5 w-3.5" />{f.name}</a>
                  <button className="btn-subtle h-7 px-2 text-xs" onClick={() => toggleVisible(f)} aria-label={f.visibleToClient ? `Ocultar ${f.name} do cliente` : `Mostrar ${f.name} ao cliente`}>{f.visibleToClient ? <><Eye className="h-3.5 w-3.5" />Visível</> : <><EyeOff className="h-3.5 w-3.5" />Interno</>}</button>
                  <button className="btn-subtle h-7 w-7 px-0" onClick={() => removeFile(f)} aria-label={`Excluir ${f.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          </section>

          <section aria-label="Ações recomendadas">
            <h3 className="kicker mb-2">Ações recomendadas</h3>
            <div className="flex flex-wrap gap-2">
              {WHATSAPP_TEMPLATES.map((t) => {
                const link = whatsappLink(o.customerPhone, whatsappText(t.text, { customerName: o.customerName, route: o.route }));
                return link
                  ? <a key={t.key} href={link} target="_blank" rel="noopener noreferrer" className="btn-ghost h-9"><MessageCircle className="h-4 w-4 text-green-400" />{t.label}</a>
                  : <span key={t.key} className="btn-ghost h-9 opacity-50" title="Cadastre o WhatsApp do cliente">{t.label}</span>;
              })}
              {!o.customerId && <Link href="/app/sales?tab=clientes" className="btn-ghost h-9"><Users className="h-4 w-4" />Cadastrar como cliente</Link>}
            </div>
          </section>

          <section aria-label="Histórico do pedido">
            <h3 className="kicker mb-2">Histórico</h3>
            <ul className="space-y-1 text-xs text-muted">
              {o.events.map((e) => (
                <li key={e.id}>{fmtDate(e.createdAt)} · {e.type === "created" ? "Pedido criado" : e.type === "stage" ? `${STAGE_LABELS[e.fromStage as OrderStageKey] ?? ""} → ${STAGE_LABELS[e.toStage as OrderStageKey] ?? ""}` : e.type === "archived" ? `Arquivado (${e.note})` : e.type === "unarchived" ? "Desarquivado" : e.type === "quote" ? `Cotação: ${e.note}` : e.note}</li>
              ))}
            </ul>
          </section>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            {o.archivedAt ? (
              <button className="btn-ghost" onClick={archive}><ArchiveRestore className="h-4 w-4" />Desarquivar</button>
            ) : archiving ? (
              <>
                <select className="input h-9 w-48" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo do arquivamento">{ARCHIVE_REASONS.map((r) => <option key={r}>{r}</option>)}</select>
                <button className="btn-ghost h-9" onClick={archive}>Confirmar</button>
              </>
            ) : (
              <button className="btn-ghost" onClick={() => setArchiving(true)}><Archive className="h-4 w-4" />Arquivar pedido</button>
            )}
            <button className="btn-ghost ml-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir pedido</button>
          </div>
        </div>
      )}
    </Modal>
  );
}


/* ---------------- Interessados em gestão de milhas ---------------- */

const LEAD_LABELS = { NEW: "Novo", CONTACTED: "Em contato", CLIENT: "Virou cliente", DISCARDED: "Descartado" } as const;
type Lead = { id: string; name: string; phone: string | null; email: string | null; message: string | null; status: keyof typeof LEAD_LABELS; createdAt: string };

export function LeadsList({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  async function status(l: Lead, s: string) {
    const r = await api(`/api/leads/${l.id}`, "PATCH", { status: s });
    if (!r.ok) return toast(r.erro, "error");
    refreshSafe(router);
  }
  return (
    <section className="card mt-4 overflow-hidden" aria-label="Interessados em gestão de milhas">
      <h2 className="border-b border-line px-5 py-3 font-semibold">Interessados em gestão de milhas <span className="text-muted">{leads.length}</span></h2>
      {leads.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">Ninguém pediu gestão de milhas pela sua página ainda.</p> : (
        <ul className="divide-y divide-line">
          {leads.map((l) => {
            const wa = whatsappLink(l.phone, whatsappText("Olá, {nome}! Vi seu interesse na gestão de milhas. Podemos conversar?", { customerName: l.name, route: "" }));
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{l.name} <span className="text-xs font-normal text-muted">· {fmtDate(l.createdAt)}</span></p>
                  <p className="truncate text-xs text-muted">{[l.phone, l.email].filter(Boolean).join(" · ")}{l.message ? ` — ${l.message}` : ""}</p>
                </div>
                {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 text-xs"><MessageCircle className="h-3.5 w-3.5 text-green-400" />WhatsApp</a>}
                <select className="input h-8 w-36 py-0 text-xs" value={l.status} onChange={(e) => status(l, e.target.value)} aria-label={`Situação de ${l.name}`}>
                  {Object.entries(LEAD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
