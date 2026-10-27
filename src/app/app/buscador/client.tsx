"use client";
import { useEffect, useState } from "react";
import { ArrowLeftRight, History, Scale, Search, ExternalLink, Trash2, Plus, Minus } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDate, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast } from "@/components/feedback";
import { AirportField } from "@/components/airport-field";
import { SEARCH_PROGRAMS, GROUP_LABELS, CABIN_LABELS, DEFAULT_PROGRAMS, PROGRAM_BY_KEY, validateSearch, type SearchParams, type Cabin } from "@/domain/flight-search";
import type { Segment, TripType } from "@/domain/orders";

type OrderOpt = { id: string; number: number; customerName: string; route: string; tripType: TripType; cabin: string; segments: Segment[]; adults: number; children: number; infants: number };
type Quote = { id: string; program: string; label: string; miles: number | null; taxesCents: number | null; cashCents: number | null; departDate: string; returnDate: string | null; notes: string | null; orderId: string | null; createdAt: string };
type Hist = { id: string; params: SearchParams; programs: string[]; createdAt: string };
const STORE_KEY = "mm:buscador:programas";

const blank = (): SearchParams => ({ origin: "", destination: "", departDate: "", returnDate: null, adults: 1, children: 0, infants: 0, cabin: "ECONOMY" });

export function BuscadorClient({ orders, initialOrderId }: { orders: OrderOpt[]; initialOrderId: string }) {
  const [p, setP] = useState<SearchParams>(blank);
  const [orderId, setOrderId] = useState("");
  const [programs, setPrograms] = useState<string[]>(DEFAULT_PROGRAMS);
  const [erro, setErro] = useState("");
  const [links, setLinks] = useState<{ key: string; label: string; url: string }[]>([]);
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
    // Primeira aba já no clique (o navegador permite); as demais a cada 2 segundos
    list.forEach((l, i) => (i === 0 ? window.open(l.url, "_blank", "noopener") : window.setTimeout(() => window.open(l.url, "_blank", "noopener"), i * 2000)));
    toast(`Abrindo ${list.length} ${list.length === 1 ? "site" : "sites"}, uma aba a cada 2 segundos…`);
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
        <p className="text-center text-xs text-muted">Abrimos uma aba por site, com intervalo de 2 segundos. Se o navegador bloquear alguma, permita pop-ups para este site ou use os links abaixo.</p>
        {links.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Links da busca">
            {links.map((l) => <li key={l.key}><a href={l.url} target="_blank" rel="noopener noreferrer" className="btn-ghost h-8 text-xs">{l.label}<ExternalLink className="h-3.5 w-3.5" /></a></li>)}
          </ul>
        )}
      </section>

      {panel === "historico" && <HistoryPanel onClose={() => setPanel(null)} onPick={(h) => { setP(h.params); savePrograms(h.programs); setPanel(null); }} />}
      {panel === "comparar" && <ComparePanel params={p} orderId={orderId} programs={programs} onClose={() => setPanel(null)} />}
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

function ComparePanel({ params, orderId, programs, onClose }: { params: SearchParams; orderId: string; programs: string[]; onClose: () => void }) {
  const [items, setItems] = useState<Quote[]>([]);
  const [program, setProgram] = useState(programs[0] ?? SEARCH_PROGRAMS[0]!.key);
  const [miles, setMiles] = useState("");
  const [taxes, setTaxes] = useState("");
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const [erro, setErro] = useState("");
  const routeOk = !validateSearch(params);
  const load = () => {
    if (!routeOk) return;
    api<{ items: Quote[] }>(`/api/quotes?origin=${params.origin}&destination=${params.destination}`).then((r) => r.ok && setItems(r.data.items));
  };
  useEffect(load, [params.origin, params.destination]); // eslint-disable-line react-hooks/exhaustive-deps

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const taxesCents = taxes.trim() ? parseBRLToCents(taxes) : null;
    const cashCents = cash.trim() ? parseBRLToCents(cash) : null;
    if ((taxes.trim() && taxesCents === null) || (cash.trim() && cashCents === null)) return setErro("Valor em reais inválido");
    const r = await api("/api/quotes", "POST", { orderId: orderId || null, program, origin: params.origin, destination: params.destination, departDate: params.departDate, returnDate: params.returnDate, cabin: params.cabin, adults: params.adults, miles: Number(miles.replace(/\D/g, "")) || null, taxesCents, cashCents, notes: notes || null });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setMiles("");
    setTaxes("");
    setCash("");
    setNotes("");
    toast("Cotação anotada");
    load();
  }
  async function remove(id: string) {
    const r = await api(`/api/quotes/${id}`, "DELETE");
    if (r.ok) load();
  }
  return (
    <Modal open onClose={onClose} size="lg" title="Comparar cotações">
      {!routeOk ? <Alert kind="info">Preencha origem, destino e ida no buscador para anotar e comparar cotações deste trecho.</Alert> : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{params.origin} → {params.destination} · {fmtDate(params.departDate)}{params.returnDate ? ` a ${fmtDate(params.returnDate)}` : ""} · {CABIN_LABELS[params.cabin]}{orderId ? " · ligada ao pedido escolhido" : ""}</p>
          <form onSubmit={add} className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-5" aria-label="Anotar cotação">
            {erro && <div className="sm:col-span-5"><Alert>{erro}</Alert></div>}
            <Field label="Programa"><select className="input" value={program} onChange={(e) => setProgram(e.target.value)}>{SEARCH_PROGRAMS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select></Field>
            <Field label="Milhas"><input className="input" inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="0" /></Field>
            <Field label="Taxas (R$)"><input className="input" inputMode="decimal" value={taxes} onChange={(e) => setTaxes(e.target.value)} placeholder="R$ 0,00" /></Field>
            <Field label="Em dinheiro (R$)"><input className="input" inputMode="decimal" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="R$ 0,00" /></Field>
            <div className="flex items-end"><button className="btn-primary w-full">Anotar</button></div>
            <Field label="Observação" className="sm:col-span-5"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Voo, horário, escalas…" /></Field>
          </form>
          {items.length === 0 ? <p className="text-center text-sm text-muted">Nenhuma cotação anotada para este trecho.</p> : (
            <div className="overflow-x-auto">
              <table className="table-base" aria-label="Cotações do trecho">
                <thead><tr><th>Programa</th><th>Data</th><th className="text-right">Milhas</th><th className="text-right">Taxas</th><th className="text-right">Em dinheiro</th><th className="hidden md:table-cell">Observação</th><th /></tr></thead>
                <tbody>
                  {items.map((q, i) => (
                    <tr key={q.id} className={i === 0 && q.miles ? "bg-green-500/5" : ""}>
                      <td className="font-semibold">{q.label}{i === 0 && q.miles ? <span className="ml-1.5 rounded bg-green-500/15 px-1.5 text-[11px] text-green-300">menor</span> : null}</td>
                      <td className="tabular-nums">{fmtDate(q.departDate)}</td>
                      <td className="text-right tabular-nums">{q.miles ? q.miles.toLocaleString("pt-BR") : "-"}</td>
                      <td className="text-right tabular-nums">{q.taxesCents ? fmtBRL(q.taxesCents) : "-"}</td>
                      <td className="text-right tabular-nums">{q.cashCents ? fmtBRL(q.cashCents) : "-"}</td>
                      <td className="hidden max-w-[220px] truncate text-muted md:table-cell">{q.notes}</td>
                      <td className="text-right"><button className="btn-subtle h-7 w-7 px-0" onClick={() => remove(q.id)} aria-label={`Excluir cotação ${q.label}`}><Trash2 className="h-3.5 w-3.5" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
