"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Coins, MessageCircle, Trash2, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { whatsappLink } from "@/domain/orders";
import { BUYER_LABELS, BUYER_TYPES, DEAL_STAGES, DEAL_STAGE_LABELS, dealProfitCents, dealTotalCents, type BuyerType, type DealStageKey } from "@/domain/miles-deals";
import type { DealView } from "@/server/services/miles-deals";

type Customer = { id: string; name: string; phone: string | null };
type AccountOpt = { id: string; label: string; balance: number; cpmCents: number | null };

const STAGE_COLOR: Record<DealStageKey, string> = { NEW: "#60a5fa", NEGOTIATION: "#f59e0b", AWAITING: "#a78bfa", ISSUED: "#22c55e", PAID: "#94a3b8" };
const BUYER_CLS: Record<BuyerType, string> = { AGENCY: "bg-blue-500/15 text-blue-300", BALCAO: "bg-amber-500/15 text-amber-300", FINAL: "bg-green-500/15 text-green-300" };
const pts = (n: number) => n.toLocaleString("pt-BR");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/* ---------------- Nova / editar negociação ---------------- */

function DealDialog({ deal, customers, accounts, balcoes, onClose, onMove }: { deal: DealView | null; customers: Customer[]; accounts: AccountOpt[]; balcoes: string[]; onClose: () => void; onMove?: (stage: DealStageKey) => void }) {
  const router = useRouter();
  const [buyerType, setBuyerType] = useState<BuyerType>(deal?.buyerType ?? "FINAL");
  const [customerId, setCustomerId] = useState(deal?.customerId ?? "");
  const [name, setName] = useState(deal?.customerName ?? "");
  const [phone, setPhone] = useState(deal?.customerPhone ?? "");
  const [accountId, setAccountId] = useState(deal?.accountId ?? "");
  const [points, setPoints] = useState(deal?.points ? pts(deal.points) : "");
  const [cpm, setCpm] = useState(deal?.saleCpmCents ? fmtBRL(deal.saleCpmCents) : "");
  const [profitIn, setProfitIn] = useState(deal?.profitManual && deal.profitCents != null ? fmtBRL(deal.profitCents) : ""); // lucro informado à mão
  const [passengers, setPassengers] = useState(deal?.passengers ? String(deal.passengers) : "");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = !!deal?.saleId; // já virou venda: conta, pontos e milheiro não mudam

  const acc = accounts.find((a) => a.id === accountId);
  const nPoints = Number(points.replace(/\D/g, "")) || null;
  const cpmCents = cpm.trim() ? parseBRLToCents(cpm) : null;
  const total = dealTotalCents(nPoints, cpmCents);
  const estimated = dealProfitCents(nPoints, cpmCents, acc?.cpmCents ?? null);
  const manualProfit = profitIn.trim() ? parseBRLToCents(profitIn) : null;
  const profit = manualProfit ?? estimated;

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setName(c.name);
      setPhone(c.phone ?? "");
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (cpm.trim() && cpmCents === null) return setErro("Preço do milheiro inválido");
    if (profitIn.trim() && manualProfit === null) return setErro("Lucro inválido");
    setBusy(true);
    const balcao = buyerType === "BALCAO";
    const body = { buyerType, customerId: balcao ? null : customerId || null, customerName: name, customerPhone: balcao ? null : phone || null, accountId: accountId || null, points: nPoints, saleCpmCents: cpmCents, profitCents: manualProfit, passengers: Number(passengers) || null, notes: notes || null };
    const r = deal ? await api(`/api/miles-deals/${deal.id}`, "PUT", body) : await api("/api/miles-deals", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(deal ? "Negociação atualizada" : "Negociação criada");
    onClose();
    refreshSafe(router);
  }
  async function remove() {
    if (!deal || !(await confirmDialog({ title: `Excluir a negociação #${deal.number}?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/miles-deals/${deal.id}`, "DELETE");
    if (!r.ok) return setErro(r.erro);
    toast("Negociação excluída");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={deal ? `Negociação #${deal.number}` : "Nova negociação"} footer={
      <>
        {deal && !locked && <button type="button" className="btn-ghost mr-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button form="deal-form" className="btn-primary" disabled={busy}>Salvar</button>
      </>
    }>
      <form id="deal-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        {deal && onMove && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa">
            {DEAL_STAGES.map((s) => (
              <button key={s} type="button" aria-pressed={deal.stage === s} onClick={() => onMove(s)} className={`rounded-lg border px-2.5 py-1 text-xs ${deal.stage === s ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{DEAL_STAGE_LABELS[s]}</button>
            ))}
          </div>
        )}
        {locked && <Alert kind="info">Venda lançada em <Link href="/app/sales" className="underline">Vendas</Link>. Para mudar conta, pontos ou milheiro, exclua a venda lá.</Alert>}
        <Field label="Comprador">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de comprador">
            {BUYER_TYPES.map((b) => (
              <button key={b} type="button" aria-pressed={buyerType === b} onClick={() => setBuyerType(b)} className={`rounded-lg border px-2.5 py-1 text-sm ${buyerType === b ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{BUYER_LABELS[b]}</button>
            ))}
          </div>
        </Field>
        {buyerType === "BALCAO" ? (
          <Field label="Nome do balcão" required>
            <input className="input" list="balcoes" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Ex.: HotMilhas" />
            <datalist id="balcoes">{balcoes.map((b) => <option key={b} value={b} />)}</datalist>
          </Field>
        ) : (
          <>
            <Field label="Cliente cadastrado">
              <select className="input" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">Novo contato (digite abaixo)</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={buyerType === "AGENCY" ? "Nome da agência" : "Nome"} required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
              <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} placeholder="(11) 90000-0000" /></Field>
            </div>
          </>
        )}
        <Field label="Conta de onde saem as milhas">
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={locked}>
            <option value="">Escolher depois</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {pts(a.balance)} pts{a.cpmCents ? ` · CPM ${fmtBRL(a.cpmCents)}` : ""}</option>)}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Pontos"><input className="input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} disabled={locked} placeholder="0" /></Field>
          <Field label="Milheiro venda (R$)"><input className="input" inputMode="decimal" value={cpm} onChange={(e) => setCpm(e.target.value)} disabled={locked} placeholder="R$ 0,00" /></Field>
          <Field label="Lucro (R$)"><input className="input" inputMode="decimal" value={profitIn} onChange={(e) => setProfitIn(e.target.value)} placeholder={estimated != null ? fmtBRL(estimated) : "R$ 0,00"} title="Vazio: estimado pelos pontos, milheiro e CPM da conta" /></Field>
          <Field label="Passageiros"><input className="input" inputMode="numeric" value={passengers} onChange={(e) => setPassengers(e.target.value.replace(/\D/g, ""))} placeholder="Opcional" /></Field>
        </div>
        <p className="text-sm text-muted">
          {total != null ? <>Total da venda: <span className="font-semibold text-zinc-100 tabular-nums">{fmtBRL(total)}</span></> : manualProfit == null ? "Informe pontos e milheiro para ver o total, ou digite o lucro." : null}
          {profit != null && <> · {manualProfit != null ? "Lucro" : "Lucro estimado"}: <span className={`font-semibold tabular-nums ${profit >= 0 ? "text-green-300" : "text-red-300"}`}>{fmtBRL(profit)}</span>{manualProfit == null && acc?.cpmCents ? <span className="text-xs"> (CPM da conta {fmtBRL(acc.cpmCents)})</span> : null}</>}
          {acc && nPoints && nPoints > acc.balance ? <span className="block text-xs text-amber-300">A conta tem só {pts(acc.balance)} pontos.</span> : null}
        </p>
        <Field label="Observações"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
      </form>
    </Modal>
  );
}

/* ---------------- Kanban ---------------- */

function Card({ d, onOpen, onDragStart }: { d: DealView; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const wa = whatsappLink(d.customerPhone, `Olá, ${d.customerName.split(/\s+/)[0]}!`);
  return (
    <li draggable onDragStart={onDragStart} className="group relative cursor-grab rounded-xl border border-line bg-panel shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-md active:cursor-grabbing" aria-label={`Negociação ${d.number} de ${d.customerName}`}>
      <button type="button" onClick={onOpen} className="w-full p-3 text-left">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-light" aria-hidden>{initials(d.customerName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">{d.customerName}</span>
            <span className="block text-[11px] text-muted">#{d.number}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BUYER_CLS[d.buyerType]}`}>{BUYER_LABELS[d.buyerType].split(" /")[0]}</span>
        </div>
        <div className="mt-3 rounded-lg bg-panel2/60 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Coins className="h-3.5 w-3.5 shrink-0 text-muted" /><span className="truncate">{d.points ? `${pts(d.points)} pts` : "Pontos a definir"}{d.saleCpmCents ? ` · ${fmtBRL(d.saleCpmCents)}/mil` : ""}</span></p>
          <p className="mt-1 truncate text-[11px] text-muted">{d.accountLabel ?? "Conta a definir"}</p>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {d.totalCents != null && <span className="rounded-full bg-panel2 px-2 py-0.5 font-medium text-zinc-300">{fmtBRL(d.totalCents)}</span>}
          {d.profitCents != null && <span className={`rounded-full px-2 py-0.5 font-medium ${d.profitCents >= 0 ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>lucro {fmtBRL(d.profitCents)}</span>}
          {d.saleId && <span className="flex items-center gap-0.5 rounded-full bg-panel2 px-2 py-0.5"><Receipt className="h-3 w-3" />venda lançada</span>}
        </div>
      </button>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute right-2 top-11 hidden h-7 w-7 items-center justify-center rounded-full border border-line bg-panel text-green-400 shadow-sm hover:bg-panel2 group-hover:flex" aria-label={`WhatsApp de ${d.customerName}`} title="Abrir WhatsApp">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  );
}

export function DealsKanban({ deals, customers, accounts }: { deals: DealView[]; customers: Customer[]; accounts: AccountOpt[] }) {
  const router = useRouter();
  const [list, setList] = useState(deals);
  const [over, setOver] = useState<DealStageKey | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [buyer, setBuyer] = useState<"ALL" | BuyerType>("ALL");
  const dragged = useRef<string | null>(null);
  useEffect(() => setList(deals), [deals]);
  useEffect(() => {
    const h = () => setCreating(true);
    window.addEventListener("mm:new-deal", h);
    return () => window.removeEventListener("mm:new-deal", h);
  }, []);

  async function move(id: string, stage: DealStageKey, position?: number) {
    const prev = list;
    setList((l) => l.map((d) => (d.id === id ? { ...d, stage } : d)));
    const r = await api<{ item: DealView }>(`/api/miles-deals/${id}/move`, "POST", { stage, position });
    if (!r.ok) {
      setList(prev);
      return toast(r.erro, "error");
    }
    if (stage === "PAID" && !prev.find((d) => d.id === id)?.saleId) toast("Venda lançada em Vendas");
    refreshSafe(router);
  }
  function drop(e: React.DragEvent, stage: DealStageKey) {
    e.preventDefault();
    setOver(null);
    const id = dragged.current ?? e.dataTransfer.getData("text/plain");
    dragged.current = null;
    if (id) move(id, stage, list.filter((d) => d.stage === stage && d.id !== id).length);
  }
  const q = query.trim().toLowerCase();
  const shown = list.filter((d) => (buyer === "ALL" || d.buyerType === buyer) && (!q || d.customerName.toLowerCase().includes(q) || String(d.number) === q.replace("#", "")));
  const openDeal = list.find((d) => d.id === open) ?? null;
  // Sugestões de nome do balcão: os já usados e as plataformas mais comuns
  const balcoes = [...new Set([...list.filter((d) => d.buyerType === "BALCAO").map((d) => d.customerName), "HotMilhas", "MaxMilhas"])];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar comprador ou nº" aria-label="Buscar negociações" />
        </label>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Comprador">
          {([["ALL", "Todos"], ...BUYER_TYPES.map((b) => [b, BUYER_LABELS[b].split(" /")[0]])] as [string, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={buyer === k} onClick={() => setBuyer(k as typeof buyer)} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${buyer === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn-primary ml-auto h-9" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nova negociação</button>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
        <div className="flex min-w-max gap-3">
          {DEAL_STAGES.map((stage) => {
            const items = shown.filter((d) => d.stage === stage);
            const total = items.reduce((t, d) => t + (d.totalCents ?? 0), 0);
            const profit = items.reduce((t, d) => t + (d.profitCents ?? 0), 0);
            return (
              <section key={stage} aria-label={DEAL_STAGE_LABELS[stage]} onDragOver={(e) => { e.preventDefault(); setOver(stage); }} onDragLeave={() => setOver((s) => (s === stage ? null : s))} onDrop={(e) => drop(e, stage)}
                className={`flex w-[290px] shrink-0 flex-col overflow-hidden rounded-2xl border transition-colors ${over === stage ? "border-accent-light bg-accent-soft/40" : "border-line bg-panel2/40"}`}>
                <div className="h-1 shrink-0" style={{ backgroundColor: STAGE_COLOR[stage] }} aria-hidden />
                <h2 className="flex items-center gap-2 px-3 pb-1 pt-3 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLOR[stage] }} aria-hidden />
                  <span className="flex-1 truncate">{DEAL_STAGE_LABELS[stage]}</span>
                  <span className="rounded-full bg-panel px-2 py-0.5 text-xs font-medium tabular-nums text-muted">{items.length}</span>
                </h2>
                <p className="px-3 pb-2 text-[11px] text-muted">{total > 0 ? `${fmtBRL(total)} · lucro ${fmtBRL(profit)}` : " "}</p>
                <ul className="max-h-[calc(100vh-320px)] min-h-[120px] flex-1 space-y-2 overflow-y-auto px-2 pb-2" role="list">
                  {items.map((d) => <Card key={d.id} d={d} onOpen={() => setOpen(d.id)} onDragStart={(e) => { dragged.current = d.id; e.dataTransfer.setData("text/plain", d.id); }} />)}
                  {items.length === 0 && <li className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-center text-xs text-muted">{q || buyer !== "ALL" ? "Nenhuma negociação com esse filtro." : stage === "PAID" ? "Arraste para cá para lançar a venda" : "Arraste negociações para cá"}</li>}
                </ul>
                {stage === "NEW" && <button type="button" className="mx-2 mb-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-sm text-muted transition-colors hover:border-zinc-500 hover:text-zinc-100" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Adicionar negociação</button>}
              </section>
            );
          })}
        </div>
      </div>
      {creating && <DealDialog deal={null} customers={customers} accounts={accounts} balcoes={balcoes} onClose={() => setCreating(false)} />}
      {openDeal && <DealDialog key={openDeal.id + openDeal.stage} deal={openDeal} customers={customers} accounts={accounts} balcoes={balcoes} onClose={() => setOpen(null)} onMove={(stage) => move(openDeal.id, stage)} />}
    </>
  );
}
