"use client";
import { useEffect, useState } from "react";
import { ArrowLeftRight, History, Scale, Search, ExternalLink, Trash2, Plus, Minus, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDate, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast } from "@/components/feedback";
import { AirportField } from "@/components/airport-field";
import { SEARCH_PROGRAMS, GROUP_LABELS, CABIN_LABELS, DEFAULT_PROGRAMS, PROGRAM_BY_KEY, validateSearch, type SearchParams, type Cabin } from "@/domain/flight-search";
import type { Segment, TripType } from "@/domain/orders";
import { parseOffers, parseSearchLink, preferredOffer, type PastedOffer } from "@/domain/quote-paste";

type OrderOpt = { id: string; number: number; customerName: string; route: string; tripType: TripType; cabin: string; segments: Segment[]; adults: number; children: number; infants: number };
type Quote = { id: string; program: string; label: string; miles: number | null; taxesCents: number | null; cashCents: number | null; departDate: string; returnDate: string | null; notes: string | null; orderId: string | null; createdAt: string; costCents: number | null; costEstimated: boolean; profitCents: number | null; costCpmCents: number | null; issueFeeCents: number | null; issueFeeBps: number | null };
type Hist = { id: string; params: SearchParams; programs: string[]; createdAt: string };
const STORE_KEY = "mm:buscador:programas";

const blank = (): SearchParams => ({ origin: "", destination: "", departDate: "", returnDate: null, adults: 1, children: 0, infants: 0, cabin: "ECONOMY" });

export function BuscadorClient({ orders, initialOrderId }: { orders: OrderOpt[]; initialOrderId: string }) {
  const [p, setP] = useState<SearchParams>(blank);
  const [orderId, setOrderId] = useState("");
  const [programs, setPrograms] = useState<string[]>(DEFAULT_PROGRAMS);
  const [erro, setErro] = useState("");
  const [links, setLinks] = useState<{ key: string; label: string; url: string }[]>([]);
  const [blocked, setBlocked] = useState(0);
  const [panel, setPanel] = useState<"historico" | "comparar" | null>(null);
  const set = (patch: Partial<SearchParams>) => { setP((x) => ({ ...x, ...patch })); setErro(""); };

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      if (Array.isArray(saved)) setPrograms(saved.filter((k: string) => PROGRAM_BY_KEY[k]));
    } catch {}
    if (initialOrderId) fromOrder(initialOrderId);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const savePrograms = (list: string[]) => {
    setPrograms(list);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(list));
    } catch {}
  };
  function fromOrder(id: string) {
    setOrderId(id);
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const first = o.segments[0];
    set({
      origin: first?.origin ?? "", destination: first?.destination ?? "", departDate: first?.date ?? "",
      returnDate: o.tripType === "ROUND_TRIP" ? o.segments[1]?.date ?? null : null,
      adults: o.adults, children: o.children, infants: o.infants, cabin: (o.cabin as Cabin) ?? "ECONOMY",
    });
  }

  async function search() {
    const err = validateSearch(p);
    if (err) return setErro(err);
    if (programs.length === 0) return setErro("Selecione ao menos um site");
    const list = programs.map((k) => ({ key: k, label: PROGRAM_BY_KEY[k]!.label, url: PROGRAM_BY_KEY[k]!.build(p) }));
    setLinks(list);
    // Todas as abas no próprio clique: abertas depois (setTimeout) o navegador trata como pop-up não
    // pedido e bloqueia. Sem "noopener" no window.open para saber se abriu (com ele, volta sempre null).
    let open = 0;
    for (const l of list) {
      const w = window.open(l.url, "_blank");
      if (w) {
        w.opener = null;
        open++;
      }
    }
    setBlocked(list.length - open);
    if (open) toast(`${open} ${open === 1 ? "aba aberta" : "abas abertas"}`);
    await api("/api/flight-searches", "POST", { params: p, programs });
  }

  const pax = p.adults + p.children + p.infants;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={() => setPanel("historico")}><History className="h-4 w-4" />Histórico</button>
        <button className="btn-ghost" onClick={() => setPanel("comparar")}><Scale className="h-4 w-4" />Comparar cotações</button>
      </div>

      <section className="card card-pad space-y-4" aria-label="Buscar passagens">
        <h2 className="text-lg font-semibold">Buscar passagens</h2>
        {erro && <Alert>{erro}</Alert>}
        {orders.length > 0 && (
          <Field label="Preencher a partir de um pedido">
            <select className="input" value={orderId} onChange={(e) => fromOrder(e.target.value)} aria-label="Preencher a partir de um pedido">
              <option value="">Nenhum</option>
              {orders.map((o) => <option key={o.id} value={o.id}>#{o.number} {o.customerName} · {o.route}</option>)}
            </select>
          </Field>
        )}
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <Field label="Origem"><AirportField value={p.origin} onChange={(v) => set({ origin: v })} ariaLabel="Origem" /></Field>
          <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => set({ origin: p.destination, destination: p.origin })} aria-label="Inverter origem e destino"><ArrowLeftRight className="h-4 w-4" /></button>
          <Field label="Destino"><AirportField value={p.destination} onChange={(v) => set({ destination: v })} ariaLabel="Destino" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ida"><input className="input" type="date" value={p.departDate} onChange={(e) => set({ departDate: e.target.value })} aria-label="Ida" /></Field>
          <Field label="Volta (opcional)" hint={p.returnDate ? undefined : "Somente ida"}><input className="input" type="date" value={p.returnDate ?? ""} min={p.departDate || undefined} onChange={(e) => set({ returnDate: e.target.value || null })} aria-label="Volta (opcional)" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="label">Passageiros <span className="text-muted">({pax})</span></p>
            {([["adults", "Adultos", 1], ["children", "Crianças", 0], ["infants", "Bebês", 0]] as const).map(([k, l, min]) => (
              <div key={k} className="flex items-center justify-between py-1 text-sm">
                <span>{l}</span>
                <span className="flex items-center gap-2">
                  <button type="button" className="btn-subtle h-7 w-7 rounded-full px-0" aria-label={`Menos ${l.toLowerCase()}`} disabled={p[k] <= min} onClick={() => set({ [k]: p[k] - 1 } as Partial<SearchParams>)}><Minus className="h-3.5 w-3.5" /></button>
                  <span className="w-4 text-center tabular-nums" aria-label={`${l}: ${p[k]}`}>{p[k]}</span>
                  <button type="button" className="btn-subtle h-7 w-7 rounded-full px-0" aria-label={`Mais ${l.toLowerCase()}`} disabled={pax >= 9} onClick={() => set({ [k]: p[k] + 1 } as Partial<SearchParams>)}><Plus className="h-3.5 w-3.5" /></button>
                </span>
              </div>
            ))}
          </div>
          <Field label="Classe">
            <select className="input" value={p.cabin} onChange={(e) => set({ cabin: e.target.value as Cabin })} aria-label="Classe">
              {(Object.keys(CABIN_LABELS) as Cabin[]).map((c) => <option key={c} value={c}>{CABIN_LABELS[c]}</option>)}
            </select>
          </Field>
        </div>

        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="label mb-0">Onde pesquisar <span className="text-muted">{programs.length} selecionados</span></p>
            <button type="button" className="btn-subtle ml-auto h-8 px-2 text-xs" onClick={() => savePrograms(SEARCH_PROGRAMS.map((x) => x.key))}>Selecionar todos</button>
            <button type="button" className="btn-subtle h-8 px-2 text-xs" onClick={() => savePrograms([])}>Limpar seleção</button>
          </div>
          {(Object.keys(GROUP_LABELS) as (keyof typeof GROUP_LABELS)[]).map((g) => (
            <fieldset key={g} className="mb-3">
              <legend className="kicker mb-1.5">{GROUP_LABELS[g]}</legend>
              <div className="flex flex-wrap gap-2">
                {SEARCH_PROGRAMS.filter((x) => x.group === g).map((x) => {
                  const on = programs.includes(x.key);
                  return (
                    <label key={x.key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm ${on ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>
                      <input type="checkbox" className="sr-only" checked={on} onChange={() => savePrograms(on ? programs.filter((k) => k !== x.key) : [...programs, x.key])} />
                      {x.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </div>
        <button className="btn-primary w-full" onClick={search}><Search className="h-4 w-4" />Buscar em todos os sites selecionados</button>
        {blocked > 0 ? (
          <Alert>O navegador bloqueou {blocked === 1 ? "1 aba" : `${blocked} abas`}. Permita pop-ups para este site (ícone na barra de endereço) e busque de novo, ou abra pelos links abaixo.</Alert>
        ) : (
          <p className="text-center text-xs text-muted">Abrimos uma aba por site. Se o navegador bloquear alguma, permita pop-ups para este site ou use os links abaixo.</p>
        )}
        {links.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Links da busca">
            {links.map((l) => <li key={l.key}><a href={l.url} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 text-xs">{l.label}<ExternalLink className="h-3.5 w-3.5" /></a></li>)}
          </ul>
        )}
      </section>

      {panel === "historico" && <HistoryPanel onClose={() => setPanel(null)} onPick={(h) => { setP(h.params); savePrograms(h.programs); setPanel(null); }} />}
      {panel === "comparar" && <ComparePanel params={p} orderId={orderId} programs={programs} onParams={set} onClose={() => setPanel(null)} />}
    </div>
  );
}

function HistoryPanel({ onClose, onPick }: { onClose: () => void; onPick: (h: Hist) => void }) {
  const [items, setItems] = useState<Hist[] | null>(null);
  const load = () => api<{ items: Hist[] }>("/api/flight-searches").then((r) => setItems(r.ok ? r.data.items : []));
  useEffect(() => {
    load();
  }, []);
  async function clear() {
    await api("/api/flight-searches", "DELETE");
    load();
  }
  return (
    <Modal open onClose={onClose} title="Histórico de pesquisas" footer={<><button className="btn-ghost mr-auto" onClick={clear}><Trash2 className="h-4 w-4" />Limpar histórico</button><button className="btn-primary" onClick={onClose}>Fechar</button></>}>
      {items === null ? <p className="py-6 text-center text-sm text-muted">Carregando…</p> : items.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nenhuma pesquisa ainda.</p> : (
        <ul className="divide-y divide-line">
          {items.map((h) => (
            <li key={h.id}>
              <button className="flex w-full items-center gap-3 py-2.5 text-left text-sm hover:bg-panel2/50" onClick={() => onPick(h)}>
                <span className="min-w-0 flex-1"><span className="font-semibold">{h.params.origin} → {h.params.destination}</span> <span className="text-muted">· {fmtDate(h.params.departDate)}{h.params.returnDate ? ` a ${fmtDate(h.params.returnDate)}` : ""} · {h.params.adults + h.params.children + h.params.infants} pax · {CABIN_LABELS[h.params.cabin]}</span></span>
                <span className="text-xs text-muted">{h.programs.length} sites</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

function ComparePanel({ params, orderId, programs, onParams, onClose }: { params: SearchParams; orderId: string; programs: string[]; onParams: (p: Partial<SearchParams>) => void; onClose: () => void }) {
  const [items, setItems] = useState<Quote[]>([]);
  const [program, setProgram] = useState(programs[0] ?? SEARCH_PROGRAMS[0]!.key);
  const [miles, setMiles] = useState("");
  const [taxes, setTaxes] = useState("");
  const [cash, setCash] = useState("");
  const [sale, setSale] = useState(""); // milheiro de venda
  const [balcao, setBalcao] = useState(false); // milhas compradas no balcão; desmarcado = minhas milhas (CPM médio do estoque)
  const [costCpm, setCostCpm] = useState(""); // preço do milheiro no balcão
  const [fee, setFee] = useState(""); // taxa de emissão cobrada do cliente: R$ fixo ou % do total da passagem
  const [feeMode, setFeeMode] = useState<"fixo" | "pct">("fixo");
  const [cpm, setCpm] = useState<Record<string, number>>({}); // CPM médio do estoque por programa
  const [notes, setNotes] = useState("");
  const [erro, setErro] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [paste, setPaste] = useState("");
  const [fromLink, setFromLink] = useState("");
  const routeOk = !validateSearch(params);
  const offers = paste.trim() ? parseOffers(paste, PROGRAM_BY_KEY[program]?.group === "dinheiro") : [];
  const load = () => {
    if (!routeOk) return;
    api<{ items: Quote[]; cpm: Record<string, number> }>(`/api/quotes?origin=${params.origin}&destination=${params.destination}`).then((r) => {
      if (!r.ok) return;
      setItems(r.data.items);
      setCpm(r.data.cpm);
    });
  };
  useEffect(load, [params.origin, params.destination]); // eslint-disable-line react-hooks/exhaustive-deps

  // Colar: o link preenche programa e busca; o texto da página vira opções de preço para escolher
  function onPaste(text: string) {
    setPaste(text);
    const link = parseSearchLink(text);
    const prog = link?.program ?? program;
    // Página de opções de pagamento da LATAM: a primeira opção já entra na cotação
    const best = preferredOffer(text, PROGRAM_BY_KEY[prog]?.group === "dinheiro");
    if (best) pick(best);
    if (!link) return setFromLink("");
    if (link.program) setProgram(link.program);
    if (Object.keys(link.params).length) onParams(link.params);
    setFromLink(`${link.program ? PROGRAM_BY_KEY[link.program]!.label : "Programa"}${Object.keys(link.params).length ? " e busca preenchidos pelo link" : " reconhecido pelo link"}`);
  }
  // Taxa de emissão sobre o total da passagem (milhas × milheiro de venda + taxas)
  const pctBps = (f: string) => {
    const x = Number(f.replace("%", "").trim().replace(",", "."));
    return f.trim() && Number.isFinite(x) && x >= 0 && x <= 100 ? Math.round(x * 100) : null;
  };
  const feeOn = (baseCents: number, f = fee, mode = feeMode) => (mode === "pct" ? Math.round((baseCents * (pctBps(f) ?? 0)) / 10_000) : (f.trim() ? parseBRLToCents(f) ?? 0 : 0));
  const ticketCents = (m: string, t: string, v: string) => {
    const n = Number(m.replace(/\D/g, ""));
    const saleCents = v.trim() ? parseBRLToCents(v) : null;
    return n && saleCents ? Math.round((n * saleCents) / 1000) + (parseBRLToCents(t) ?? 0) : null;
  };
  // Com o milheiro de venda, o valor em dinheiro é calculado: milhas × milheiro + taxas + taxa de emissão
  function recalc(m: string, t: string, v: string, f = fee, mode = feeMode) {
    const base = ticketCents(m, t, v);
    if (base != null) setCash(fmtBRL(base + feeOn(base, f, mode)));
  }
  function pick(o: PastedOffer) {
    const m = o.miles ? o.miles.toLocaleString("pt-BR") : "";
    const t = o.taxesCents != null ? fmtBRL(o.taxesCents) : "";
    setMiles(m);
    setTaxes(t);
    setCash(o.cashCents != null ? fmtBRL(o.cashCents) : "");
    recalc(m, t, sale);
  }
  const offerLabel = (o: PastedOffer) => (o.miles ? `${o.miles.toLocaleString("pt-BR")} milhas${o.taxesCents != null ? ` + ${fmtBRL(o.taxesCents)}` : ""}` : fmtBRL(o.cashCents ?? 0));
  const picked = (o: PastedOffer) => (o.miles ? o.miles.toLocaleString("pt-BR") : "") === miles && (o.taxesCents != null ? fmtBRL(o.taxesCents) : "") === taxes && (o.cashCents != null ? fmtBRL(o.cashCents) : "") === cash;

  function resetForm() {
    setEditing(null);
    setErro("");
    setMiles("");
    setTaxes("");
    setCash("");
    setNotes("");
  }
  function edit(q: Quote) {
    setEditing(q.id);
    setErro("");
    setProgram(q.program);
    setMiles(q.miles ? q.miles.toLocaleString("pt-BR") : "");
    setTaxes(q.taxesCents != null ? fmtBRL(q.taxesCents) : "");
    setCash(q.cashCents != null ? fmtBRL(q.cashCents) : "");
    setSale(q.miles && q.cashCents != null ? fmtBRL(Math.round(((q.cashCents - (q.taxesCents ?? 0) - (q.issueFeeCents ?? 0)) * 1000) / q.miles)) : "");
    setBalcao(q.costCpmCents != null);
    setCostCpm(q.costCpmCents != null ? fmtBRL(q.costCpmCents) : "");
    setFeeMode(q.issueFeeBps != null ? "pct" : "fixo");
    setFee(q.issueFeeBps != null ? String(q.issueFeeBps / 100).replace(".", ",") : q.issueFeeCents != null ? fmtBRL(q.issueFeeCents) : "");
    setNotes(q.notes ?? "");
  }
  // Potencial de lucro da cotação do formulário: custo do milheiro informado (balcão) ou CPM médio do estoque
  const formMiles = Number(miles.replace(/\D/g, "")) || 0;
  const formCash = cash.trim() ? parseBRLToCents(cash) : null;
  const formCost = balcao ? (costCpm.trim() ? parseBRLToCents(costCpm) : null) : cpm[program];
  const formProfit = formMiles && formCash != null && formCost ? formCash - (parseBRLToCents(taxes) ?? 0) - Math.round((formMiles * formCost) / 1000) : null;
  const formTicket = ticketCents(miles, taxes, sale);
  const formFee = formTicket != null ? feeOn(formTicket) : feeMode === "fixo" && fee.trim() ? parseBRLToCents(fee) : null;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const taxesCents = taxes.trim() ? parseBRLToCents(taxes) : null;
    const cashCents = cash.trim() ? parseBRLToCents(cash) : null;
    const costCpmCents = balcao && costCpm.trim() ? parseBRLToCents(costCpm) : null;
    if ([[taxes, taxesCents], [cash, cashCents], [balcao ? costCpm : "", costCpmCents]].some(([raw, v]) => String(raw).trim() && v === null)) return setErro("Valor em reais inválido");
    if (fee.trim() && (feeMode === "pct" ? pctBps(fee) === null : parseBRLToCents(fee) === null)) return setErro(feeMode === "pct" ? "Taxa de emissão: informe um percentual de 0 a 100" : "Valor em reais inválido");
    const values = { program, miles: Number(miles.replace(/\D/g, "")) || null, taxesCents, cashCents, costCpmCents, issueFeeCents: fee.trim() ? formFee : null, issueFeeBps: fee.trim() && feeMode === "pct" ? pctBps(fee) : null, notes: notes || null };
    const r = editing
      ? await api(`/api/quotes/${editing}`, "PATCH", values)
      : await api("/api/quotes", "POST", { ...values, orderId: orderId || null, origin: params.origin, destination: params.destination, departDate: params.departDate, returnDate: params.returnDate, cabin: params.cabin, adults: params.adults });
    if (!r.ok) return setErro(r.erro);
    toast(editing ? "Cotação atualizada" : "Cotação anotada");
    resetForm();
    setPaste("");
    setFromLink("");
    load();
  }
  async function remove(id: string) {
    const r = await api(`/api/quotes/${id}`, "DELETE");
    if (!r.ok) return;
    if (editing === id) resetForm();
    load();
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Comparar cotações">
      <div className="mb-4 space-y-2">
        <Field label="Colar link ou texto da página">
          <textarea className="input min-h-16 text-sm" value={paste} onChange={(e) => onPaste(e.target.value)} placeholder="Cole o link da busca e/ou o texto da página de resultados do programa (Ctrl+A, Ctrl+C)" />
        </Field>
        {fromLink && <p className="text-xs text-muted">{fromLink}.{offers.length === 0 && " O link não traz milhas nem taxas: na página de resultados do programa, selecione tudo (Ctrl+A), copie (Ctrl+C) e cole aqui também para escolher o valor."}</p>}
        {paste.trim() && (offers.length > 0 ? (
          <div className="space-y-1.5">
            <p className="text-xs text-muted">Escolha a opção para preencher a cotação:</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Opções encontradas no texto">
              {offers.map((o) => (
                <button key={`${o.miles}-${o.taxesCents}-${o.cashCents}`} type="button" onClick={() => pick(o)} aria-pressed={picked(o)} className={`rounded-lg border px-2.5 py-1 text-xs tabular-nums ${picked(o) ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{offerLabel(o)}</button>
              ))}
            </div>
          </div>
        ) : !fromLink || paste.replace(/https?:\/\/\S+/g, "").trim() ? <p className="text-xs text-muted">Nenhum valor em milhas ou reais encontrado no texto.</p> : null)}
      </div>
      {!routeOk ? <Alert kind="info">Preencha origem, destino e ida no buscador para anotar e comparar cotações deste trecho.</Alert> : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{params.origin} → {params.destination} · {fmtDate(params.departDate)}{params.returnDate ? ` a ${fmtDate(params.returnDate)}` : ""} · {CABIN_LABELS[params.cabin]}{orderId ? " · ligada ao pedido escolhido" : ""}</p>
          <form onSubmit={add} className="grid items-end gap-3 rounded-xl border border-line p-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))_auto]" aria-label={editing ? "Editar cotação" : "Anotar cotação"}>
            {erro && <div className="sm:col-span-6"><Alert>{erro}</Alert></div>}
            <Field label="Programa"><select className="input" value={program} onChange={(e) => setProgram(e.target.value)}>{SEARCH_PROGRAMS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
            <Field label="Milhas"><input className="input" inputMode="numeric" value={miles} onChange={(e) => { setMiles(e.target.value); recalc(e.target.value, taxes, sale); }} placeholder="0" /></Field>
            <Field label="Taxas (R$)"><input className="input" inputMode="decimal" value={taxes} onChange={(e) => { setTaxes(e.target.value); recalc(miles, e.target.value, sale); }} placeholder="R$ 0,00" /></Field>
            <Field label="Milheiro (R$)"><input className="input" inputMode="decimal" value={sale} onChange={(e) => { setSale(e.target.value); recalc(miles, taxes, e.target.value); }} placeholder="R$ 0,00" /></Field>
            <Field label="Em dinheiro (R$)"><input className="input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="R$ 0,00" /></Field>
            <div className="flex gap-2">
              <button className="btn-primary w-full px-6">{editing ? "Salvar" : "Anotar"}</button>
              {editing && <button type="button" className="btn-ghost" onClick={resetForm}>Cancelar</button>}
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="label mb-0">Custo milheiro</span>
                <label className="flex cursor-pointer items-center gap-1 text-xs text-muted">
                  <input type="checkbox" checked={balcao} onChange={(e) => { setBalcao(e.target.checked); if (!e.target.checked) setCostCpm(""); }} />
                  Balcão
                </label>
              </div>
              {balcao
                ? <input className="input" inputMode="decimal" value={costCpm} onChange={(e) => setCostCpm(e.target.value)} placeholder="R$ 0,00" aria-label="Preço do milheiro no balcão" autoFocus />
                : <input className="input" value={cpm[program] ? fmtBRL(cpm[program]!) : ""} placeholder="Sem estoque" disabled aria-label="CPM médio do meu estoque no programa" title="CPM médio das suas contas do programa" />}
            </div>
            <Field label="Taxa emissão">
              <div className="flex gap-1.5">
                <input className="input min-w-0 flex-1" inputMode="decimal" value={fee} onChange={(e) => { setFee(e.target.value); recalc(miles, taxes, sale, e.target.value); }} placeholder={feeMode === "pct" ? "0" : "R$ 0,00"} />
                <select className="input w-16 shrink-0 px-2" value={feeMode} onChange={(e) => { const mode = e.target.value as "fixo" | "pct"; setFeeMode(mode); recalc(miles, taxes, sale, fee, mode); }} aria-label="Tipo da taxa de emissão">
                  <option value="fixo">R$</option>
                  <option value="pct">%</option>
                </select>
              </div>
            </Field>
            <p className="self-center text-xs text-muted sm:col-span-4">
              {balcao ? (costCpm.trim() ? "Custo pelo milheiro do balcão" : "Informe o preço do milheiro no balcão") : cpm[program] ? `Custo pelo CPM médio das suas milhas em ${PROGRAM_BY_KEY[program]?.label}` : `Sem milhas suas com custo em ${PROGRAM_BY_KEY[program]?.label ?? "este programa"}: marque Balcão e informe o preço`}
              {formTicket != null && formFee ? <> · Passagem {fmtBRL(formTicket)} + emissão {fmtBRL(formFee)}</> : null}
              {formProfit != null && <> · Potencial de lucro: <span className={`font-semibold tabular-nums ${formProfit >= 0 ? "text-green-300" : "text-red-300"}`}>{fmtBRL(formProfit)}</span></>}
            </p>
            <Field label="Observação" className="sm:col-span-6"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Voo, horário, escalas…" /></Field>
          </form>
          {items.length === 0 ? <p className="text-center text-sm text-muted">Nenhuma cotação anotada para este trecho.</p> : (
            <div className="overflow-x-auto">
              <table className="table-base" aria-label="Cotações do trecho">
                <thead><tr><th>Programa</th><th>Data</th><th className="text-right">Milhas</th><th className="text-right">Taxas</th><th className="text-right">Em dinheiro</th><th className="text-right" title="Em dinheiro − taxas − milhas pelo custo do milheiro (balcão) ou CPM médio do estoque. A taxa de emissão cobrada está no valor em dinheiro">Lucro</th><th className="hidden md:table-cell">Observação</th><th /></tr></thead>
                <tbody>
                  {items.map((q) => {
                    const cheapest = q.costCents != null && q.costCents === items[0]!.costCents && items.length > 1;
                    return (
                    <tr key={q.id} className={editing === q.id ? "bg-accent-soft" : cheapest ? "bg-green-500/5" : ""}>
                      <td className="font-semibold">{q.label}{cheapest ? <span className="ml-1.5 rounded bg-green-500/15 px-1.5 text-[11px] text-green-300" title={q.costEstimated ? "Menor custo estimado: milhas pelo valor de mercado do milheiro + taxas" : "Menor valor em reais"}>menor</span> : null}</td>
                      <td className="tabular-nums">{fmtDate(q.departDate)}</td>
                      <td className="text-right tabular-nums">{q.miles ? q.miles.toLocaleString("pt-BR") : "-"}</td>
                      <td className="text-right tabular-nums">{q.taxesCents ? fmtBRL(q.taxesCents) : "-"}</td>
                      <td className="text-right tabular-nums">{q.cashCents ? fmtBRL(q.cashCents) : q.costEstimated ? <span className="text-muted" title="Estimado: milhas pelo valor de mercado do milheiro + taxas">≈ {fmtBRL(q.costCents!)}</span> : "-"}</td>
                      <td className={`text-right tabular-nums ${q.profitCents == null ? "" : q.profitCents >= 0 ? "text-green-300" : "text-red-300"}`}>{q.profitCents != null ? fmtBRL(q.profitCents) : "-"}</td>
                      <td className="hidden max-w-[220px] truncate text-muted md:table-cell">{q.notes}</td>
                      <td className="whitespace-nowrap text-right">
                        <button className="btn-subtle h-7 w-7 px-0" onClick={() => edit(q)} aria-label={`Editar cotação ${q.label}`}><Pencil className="h-3.5 w-3.5" /></button>
                        <button className="btn-subtle h-7 w-7 px-0" onClick={() => remove(q.id)} aria-label={`Excluir cotação ${q.label}`}><Trash2 className="h-3.5 w-3.5" /></button>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
