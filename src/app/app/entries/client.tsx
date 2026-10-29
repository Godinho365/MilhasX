"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useNav, refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { Search, Filter, Download, MoreHorizontal, Pencil, Trash2, CheckCheck, ArrowDown, ArrowUp, ChevronsUpDown, FileText, X, Eye, EyeOff, Copy, Repeat, Receipt } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDate, fmtSignedPts, fmtPts, parseBRLToCents } from "@/lib/format";
import { ENTRY_LABELS, MANUAL_CREDIT_TYPES, MANUAL_DEBIT_TYPES, type EntryType } from "@/domain/ledger";
import { COST_LABELS, costTypesFor, type CostType } from "@/domain/costs";
import { airportLabel } from "@/domain/airports";
import { EntryIcon } from "@/components/entry-meta";
import { ProgramDot } from "@/components/stat";
import { openEntryForm } from "@/components/entry-forms";
import { CostRows, costsPayload, emptyCost, PaymentFields, emptyPay, toPlan, paymentDetail, type CostRow, type CardOpt, type PayState } from "@/components/form-parts";
import { planCost, scaleCosts } from "@/domain/installments";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type Row = { id: string; date: string; program: string; holder: string; color: string; type: EntryType; description: string; points: number; costCents: number; inputCostCents: number; status: string; grouped: boolean; ignored: boolean };
type Opt = { id: string; name: string };

const OPS: [string, string][] = [
  ["", "Todas as operações"], ["credit", "Somente créditos"], ["debit", "Somente débitos"], ["PENDING", "A receber"],
  ...(Object.entries(ENTRY_LABELS) as [string, string][]),
];
const MANUAL = new Set<string>([...MANUAL_CREDIT_TYPES, ...MANUAL_DEBIT_TYPES]);
/** Chaves de URL que contam como filtro (chips "Filtros ativos"). */
const FILTER_KEYS = ["q", "direction", "type", "status", "accountId", "programId", "cardId", "from", "to", "minPoints", "maxPoints", "minCost", "maxCost", "outdated", "excludeIgnored"] as const;

export function EntriesView({ items, programs, accounts, cards, exportHref, openNew, sp }: { items: Row[]; programs: Opt[]; accounts: Opt[]; cards: CardOpt[]; exportHref: string; openNew?: string; sp: Record<string, string> }) {
  const router = useRouter();
  const nav = useNav();
  const params = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [details, setDetails] = useState<Row | null>(null);
  const [menu, setMenu] = useState<{ row: Row; top: number; right: number } | null>(null);
  const opened = useRef(false);

  useEffect(() => {
    if (openNew && !opened.current) {
      opened.current = true;
      openEntryForm(openNew === "transfer" ? "transfer" : openNew === "debit" ? "debit" : "credit");
    }
  }, [openNew]);
  useEffect(() => setSelected(new Set()), [items]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function openMenu(r: Row, el: HTMLElement) {
    if (menu?.row.id === r.id) return setMenu(null);
    const rect = el.getBoundingClientRect();
    const height = 200;
    const top = rect.bottom + height > window.innerHeight - 8 ? rect.top - height - 4 : rect.bottom + 4;
    setMenu({ row: r, top, right: window.innerWidth - rect.right });
  }

  const currentOp = params.get("status") === "PENDING" ? "PENDING" : params.get("direction") ?? params.get("type") ?? "";
  const activeFilters = FILTER_KEYS.filter((k) => k !== "q" && params.get(k)).length;

  function go(patch: Record<string, string | null>) {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    u.delete("page");
    u.delete("novo");
    nav(`/app/entries?${u.toString()}`);
  }
  function setOp(op: string) {
    go({ direction: op === "credit" || op === "debit" ? op : null, status: op === "PENDING" ? "PENDING" : null, type: op && !["credit", "debit", "PENDING"].includes(op) ? op : null });
  }

  // Chips dos filtros ativos, com o texto legível de cada um
  const brl = (c: string) => fmtBRL(Number(c));
  const chipLabel: Record<(typeof FILTER_KEYS)[number], (v: string) => string> = {
    q: (v) => `Busca: ${v}`,
    direction: (v) => (v === "credit" ? "Operação: Créditos" : "Operação: Débitos"),
    type: (v) => `Tipo: ${ENTRY_LABELS[v as EntryType] ?? v}`,
    status: () => "Status: A receber",
    accountId: (v) => `Programa: ${accounts.find((a) => a.id === v)?.name ?? "conta"}`,
    programId: (v) => `Programa: ${programs.find((p) => p.id === v)?.name ?? "programa"}`,
    cardId: (v) => `Cartão: ${cards.find((c) => c.id === v)?.name ?? "cartão"}`,
    from: (v) => `De: ${fmtDate(v)}`,
    to: (v) => `Até: ${fmtDate(v)}`,
    minPoints: (v) => `Pontos ≥ ${fmtPts(Number(v))}`,
    maxPoints: (v) => `Pontos ≤ ${fmtPts(Number(v))}`,
    minCost: (v) => `Custo ≥ ${brl(v)}`,
    maxCost: (v) => `Custo ≤ ${brl(v)}`,
    outdated: () => "Somente desatualizados",
    excludeIgnored: () => "Sem ignorados",
  };
  const chips = FILTER_KEYS.filter((k) => params.get(k)).map((k) => ({ key: k, label: chipLabel[k](params.get(k)!) }));

  async function removeIds(ids: string[], label: string) {
    const groupedCount = items.filter((i) => ids.includes(i.id) && i.grouped).length;
    const ok = await confirmDialog({
      title: `Excluir ${label}?`,
      body: groupedCount > 0 ? `${groupedCount} deles fazem parte de transferências ou vendas: todas as partes dessas operações também serão excluídas. Saldos e custos serão recalculados.` : "Saldos e custos serão recalculados.",
      confirmLabel: "Excluir",
      danger: true,
    });
    if (!ok) return;
    const r = await api<{ deleted: number }>("/api/entries/bulk-delete", "POST", { ids });
    if (!r.ok) return toast(r.erro, "error");
    toast(`${r.data.deleted} ${r.data.deleted === 1 ? "lançamento excluído" : "lançamentos excluídos"}`);
    refreshSafe(router);
  }
  async function toggleIgnored(r: Row) {
    const res = await api(`/api/entries/${r.id}/ignore`, "POST", { ignored: !r.ignored });
    if (!res.ok) return toast(res.erro, "error");
    toast(r.ignored ? "Lançamento volta a contar nos relatórios" : "Lançamento ignorado nos relatórios");
    refreshSafe(router);
  }
  async function confirmPending(ids: string[]) {
    for (const id of ids) {
      const r = await api(`/api/entries/${id}`, "PATCH", { status: "CONFIRMED" });
      if (!r.ok) return toast(r.erro, "error");
    }
    toast("Pontos marcados como recebidos");
    refreshSafe(router);
  }
  /** Duplicar: abre o formulário já preenchido com programa, categoria, pontos, descrição e custos (data de hoje). */
  async function duplicate(r: Row) {
    const d = await api<Detail>(`/api/entries/${r.id}`);
    if (!d.ok) return toast(d.erro, "error");
    const e = d.data.entry;
    openEntryForm(e.points > 0 ? "credit" : "debit", {
      accountId: e.accountId,
      type: e.type,
      points: Math.abs(e.points),
      description: e.description,
      // Lançamento antigo sem custos detalhados: o custo vira uma linha (Pontos na compra, Outros nos demais)
      costs: e.costs.length
        ? e.costs.map((c) => ({ type: c.type, amountCents: c.amountCents, cardId: c.card?.id ?? null }))
        : e.points > 0 && e.inputCostCents > 0
          ? [{ type: costTypesFor(e.type).includes("PONTOS") ? "PONTOS" : "OUTROS", amountCents: e.inputCostCents, cardId: null }]
          : [],
    });
  }

  const sortIcon = (col: string) => {
    const cur = sp.sort ?? "occurredAt";
    if (cur !== col) return <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" />;
    return (sp.order ?? "desc") === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />;
  };
  const sortHref = (col: string) => {
    const u = new URLSearchParams(sp);
    const same = (sp.sort ?? "occurredAt") === col;
    u.set("sort", col);
    u.set("order", same && (sp.order ?? "desc") === "desc" ? "asc" : "desc");
    u.delete("page");
    return `/app/entries?${u.toString()}`;
  };
  const sortHeader = (col: string, label: string) => (
    <button type="button" className="inline-flex items-center gap-1 hover:text-white" onClick={() => nav(sortHref(col))}>{label} {sortIcon(col)}</button>
  );
  const allSelected = items.length > 0 && selected.size === items.length;
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const pendingSelected = items.filter((i) => selected.has(i.id) && i.status === "PENDING").map((i) => i.id);

  const rowMenu = (r: Row) => (
    <button
      className="btn-subtle h-8 w-8 px-0"
      onClick={(e) => { e.stopPropagation(); openMenu(r, e.currentTarget); }}
      aria-label={`Ações de ${r.description}`}
      aria-haspopup="menu"
      aria-expanded={menu?.row.id === r.id}
    >
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
  const menuItem = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button role="menuitem" className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line ${danger ? "text-red-300" : ""}`} onClick={() => { setMenu(null); onClick(); }}>{icon}{label}</button>
  );

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <form className="relative min-w-0 flex-1 sm:basis-60" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") || "") || null }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" name="q" placeholder="Buscar" defaultValue={params.get("q") ?? ""} key={params.get("q") ?? ""} aria-label="Buscar na descrição" />
        </form>
        <select className="input order-last w-full sm:order-none sm:w-56" value={currentOp} onChange={(e) => setOp(e.target.value)} aria-label="Tipo de operação">
          {OPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button className="btn-ghost btn-icon relative" onClick={() => setFilters(true)} aria-label="Filtros e busca" title="Filtros e busca">
          <Filter className="h-4 w-4" />
          {activeFilters > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-light px-1 text-[10px] font-bold text-zinc-950">{activeFilters}</span>}
        </button>
        <a className="btn-ghost btn-icon" href={exportHref} aria-label="Exportar CSV" title="Exportar CSV"><Download className="h-4 w-4" /></a>
      </div>

      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-panel px-4 py-2.5" aria-label="Filtros ativos">
          <span className="text-sm text-muted">Filtros ativos</span>
          {chips.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1 rounded-full border border-accent/40 bg-accent-soft/50 px-2.5 py-0.5 text-xs font-medium text-accent-light">
              {c.label}
              <button type="button" onClick={() => go({ [c.key]: null })} aria-label={`Remover filtro ${c.label}`} className="rounded-full hover:text-white"><X className="h-3 w-3" /></button>
            </span>
          ))}
          <button type="button" className="ml-auto text-sm font-medium hover:underline" onClick={() => nav("/app/entries")}>Limpar tudo</button>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-16 z-10 mb-3 flex animate-pop-in flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/60 px-4 py-2.5 backdrop-blur">
          <span className="text-sm font-medium">{selected.size} selecionado{selected.size > 1 ? "s" : ""}</span>
          <span className="ml-auto" />
          {pendingSelected.length > 0 && <button className="btn-ghost h-8" onClick={() => confirmPending(pendingSelected)}><CheckCheck className="h-4 w-4" />Marcar recebidos</button>}
          <button className="btn-danger h-8" onClick={() => removeIds([...selected], `${selected.size} lançamento${selected.size > 1 ? "s" : ""}`)}><Trash2 className="h-4 w-4" />Excluir</button>
          <button className="btn-subtle h-8" onClick={() => setSelected(new Set())}>Limpar seleção</button>
        </div>
      )}

      {items.length === 0 ? (
        <Empty title="Nenhum lançamento encontrado" icon={<FileText className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{chips.length ? "Nenhum lançamento com esses filtros." : "Registre créditos, débitos e transferências pelo botão “Novo lançamento”."}</p>
          {chips.length ? <button className="btn-ghost" onClick={() => nav("/app/entries")}>Limpar filtros</button> : <button className="btn-primary" onClick={() => openEntryForm("credit")}>Novo crédito</button>}
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          {/* Desktop: tabela */}
          <div className="relative hidden overflow-x-auto md:block">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12"><input type="checkbox" className="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))} aria-label="Selecionar todos" /></th>
                <th>{sortHeader("occurredAt", "Data")}</th>
                <th>Programa</th>
                <th>Descrição</th>
                <th className="text-right">{sortHeader("points", "Pontos")}</th>
                <th className="hidden text-right lg:table-cell">{sortHeader("costCents", "Custo")}</th>
                <th className="hidden text-right lg:table-cell">CPM</th>
                <th className="w-16 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const cpm = r.points > 0 && r.costCents > 0 ? Math.round((r.costCents * 1000) / r.points) : null;
                return (
                  <tr key={r.id} className={selected.has(r.id) ? "bg-accent-soft/30" : ""}>
                    <td><input type="checkbox" className="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Selecionar ${r.description}`} /></td>
                    <td className="whitespace-nowrap font-medium tabular-nums">{fmtDate(r.date)}</td>
                    <td className="max-w-[150px] lg:max-w-[200px]"><span className="flex items-center gap-2"><ProgramDot color={r.color} /><span className="truncate font-medium">{r.program} {r.holder}</span></span></td>
                    <td className="max-w-[200px] lg:max-w-[280px]">
                      <button type="button" className="flex max-w-full items-center gap-2 text-left hover:underline" onClick={() => setDetails(r)}>
                        <EntryIcon type={r.type} />
                        <span className="truncate">{r.description}</span>
                        {r.status === "PENDING" && <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-300">{new Date(r.date) < new Date() ? "desatualizado" : "a receber"}</span>}
                        {r.ignored && <span className="shrink-0 rounded-full bg-panel2 px-2 py-0.5 text-[11px] font-medium text-muted" title="Fora dos relatórios">ignorado</span>}
                      </button>
                    </td>
                    <td className={`whitespace-nowrap text-right font-semibold tabular-nums ${r.points > 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(r.points)}</td>
                    <td className="hidden whitespace-nowrap text-right tabular-nums text-muted lg:table-cell">{r.points > 0 && r.costCents > 0 ? fmtBRL(r.costCents) : "-"}</td>
                    <td className="hidden whitespace-nowrap text-right tabular-nums text-muted lg:table-cell">{cpm != null ? fmtBRL(cpm) : "-"}</td>
                    <td className="text-right">{rowMenu(r)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          {/* Celular: lista */}
          <ul className="divide-y divide-line md:hidden">
            {items.map((r) => (
              <li key={r.id} className={`flex items-center gap-3 px-3 py-3 ${selected.has(r.id) ? "bg-accent-soft/30" : ""}`}>
                <input type="checkbox" className="checkbox shrink-0" checked={selected.has(r.id)} onChange={() => toggle(r.id)} aria-label={`Selecionar ${r.description}`} />
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDetails(r)}>
                  <p className="flex items-center gap-1.5 text-[15px] font-semibold"><EntryIcon type={r.type} /><span className="truncate">{r.description}</span></p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted">
                    {fmtDate(r.date)} • <ProgramDot color={r.color} /> <span className="truncate">{r.program} {r.holder}</span>
                    {r.status === "PENDING" && <span className="text-amber-300">• a receber</span>}
                  </p>
                </button>
                <span className={`shrink-0 text-[15px] font-semibold tabular-nums ${r.points > 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(r.points)}</span>
                {rowMenu(r)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {menu && (
        <div role="menu" style={{ top: menu.top, right: menu.right }} className="fixed z-50 w-48 animate-pop-in rounded-xl border border-line bg-panel2 p-1 text-left shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
          {menuItem(<Eye className="h-4 w-4" />, "Ver detalhes", () => setDetails(menu.row))}
          {menu.row.status === "PENDING" && menuItem(<CheckCheck className="h-4 w-4 text-ok" />, "Marcar recebido", () => confirmPending([menu.row.id]))}
          {!menu.row.grouped && menuItem(<Pencil className="h-4 w-4" />, "Editar", () => setEditing(menu.row))}
          {!menu.row.grouped && MANUAL.has(menu.row.type) && menuItem(<Copy className="h-4 w-4" />, "Duplicar", () => duplicate(menu.row))}
          {menuItem(<EyeOff className="h-4 w-4" />, menu.row.ignored ? "Voltar aos relatórios" : "Ignorar nos relatórios", () => toggleIgnored(menu.row))}
          <div className="my-1 border-t border-line" />
          {menuItem(<Trash2 className="h-4 w-4" />, "Excluir", () => removeIds([menu.row.id], menu.row.grouped ? "esta operação" : "este lançamento"), true)}
        </div>
      )}
      {filters && <FiltersDialog accounts={accounts} cards={cards} onClose={() => setFilters(false)} />}
      {details && <DetailsDialog row={details} onClose={() => setDetails(null)} onEdit={() => { setEditing(details); setDetails(null); }} />}
      {editing && <EditDialog row={editing} cards={cards} onClose={() => setEditing(null)} />}
    </>
  );
}

/* ---------------- Filtros e busca ---------------- */

function FiltersDialog({ accounts, cards, onClose }: { accounts: Opt[]; cards: CardOpt[]; onClose: () => void }) {
  const router = useRouter();
  const nav = useNav();
  const params = useSearchParams();
  const get = (k: string) => params.get(k) ?? "";
  const reais = (k: string) => (params.get(k) ? (Number(params.get(k)) / 100).toFixed(2).replace(".", ",") : "");
  const [erro, setErro] = useState("");

  function apply(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) || "").trim();
    const u = new URLSearchParams();
    if (params.get("q")) u.set("q", params.get("q")!);
    for (const k of ["sort", "order"]) if (params.get(k)) u.set(k, params.get(k)!);
    const op = s("op");
    if (op) u.set("direction", op);
    for (const k of ["accountId", "cardId", "type", "from", "to"]) if (s(k)) u.set(k, s(k));
    for (const k of ["minPoints", "maxPoints"]) if (s(k)) u.set(k, String(Number(s(k).replace(/\D/g, ""))));
    for (const k of ["minCost", "maxCost"]) {
      if (!s(k)) continue;
      const c = parseBRLToCents(s(k));
      if (c === null) return setErro("Valor de custo inválido");
      u.set(k, String(c));
    }
    if (f.get("pending") === "on") u.set("status", "PENDING");
    if (f.get("outdated") === "on") u.set("outdated", "1");
    if (f.get("excludeIgnored") === "on") u.set("excludeIgnored", "1");
    if (u.get("from") && u.get("to") && u.get("from")! > u.get("to")!) return setErro("A data inicial precisa ser antes da final");
    onClose();
    nav(`/app/entries?${u.toString()}`);
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Filtros e busca"
      footer={<><button type="button" className="btn-ghost mr-auto" onClick={() => { onClose(); nav("/app/entries"); }}>Limpar filtros</button><button type="button" className="btn-ghost" onClick={onClose}>Fechar</button><button form="entries-filters" className="btn-primary">Aplicar</button></>}
    >
      <form id="entries-filters" onSubmit={apply} className="grid gap-4 sm:grid-cols-2">
        {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
        <Field label="Operação">
          <select className="input" name="op" defaultValue={get("direction")}>
            <option value="">Todos</option>
            <option value="credit">Créditos</option>
            <option value="debit">Débitos</option>
          </select>
        </Field>
        <Field label="Programa">
          <select className="input" name="accountId" defaultValue={get("accountId")}>
            <option value="">Todos os programas</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Cartão de crédito">
          <select className="input" name="cardId" defaultValue={get("cardId")}>
            <option value="">Todos os cartões</option>
            {cards.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select className="input" name="type" defaultValue={get("type")}>
            <option value="">Todos os tipos</option>
            {(Object.entries(ENTRY_LABELS) as [string, string][]).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Data inicial"><input className="input" type="date" name="from" defaultValue={get("from")} /></Field>
        <Field label="Data final"><input className="input" type="date" name="to" defaultValue={get("to")} /></Field>
        <Field label="Pontos mínimos"><input className="input" inputMode="numeric" name="minPoints" placeholder="0" defaultValue={get("minPoints")} /></Field>
        <Field label="Pontos máximos"><input className="input" inputMode="numeric" name="maxPoints" placeholder="999999" defaultValue={get("maxPoints")} /></Field>
        <Field label="Custo mínimo (R$)"><input className="input" inputMode="decimal" name="minCost" placeholder="R$ 0,00" defaultValue={reais("minCost")} /></Field>
        <Field label="Custo máximo (R$)"><input className="input" inputMode="decimal" name="maxCost" placeholder="R$ 9.999,99" defaultValue={reais("maxCost")} /></Field>
        <div className="sm:col-span-2">
          <span className="label">Status</span>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="checkbox" name="pending" defaultChecked={params.get("status") === "PENDING"} />Somente pontos a receber</label>
            <label className="flex items-center gap-2 text-sm" title="Pontos a receber cuja data já passou e ainda não foram marcados como recebidos"><input type="checkbox" className="checkbox" name="outdated" defaultChecked={params.get("outdated") === "1"} />Somente desatualizados</label>
            <label className="flex items-center gap-2 text-sm" title="Esconde os lançamentos marcados para ficar fora dos relatórios"><input type="checkbox" className="checkbox" name="excludeIgnored" defaultChecked={params.get("excludeIgnored") === "1"} />Excluir ignorados</label>
          </div>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Ver detalhes ---------------- */

type Detail = {
  entry: {
    id: string; accountId: string; type: EntryType; status: string; points: number; costCents: number; inputCostCents: number; occurredAt: string; description: string;
    details: Record<string, unknown> | null;
    account: { program: { name: string; color: string }; holder: { name: string } };
    costs: { id: string; type: string; amountCents: number; card: { id: string; name: string } | null }[];
  };
  recurrence: { id: string; description: string; active: boolean } | null;
  legs: { id: string; type: EntryType; points: number; costCents: number; status: string; account: { program: { name: string }; holder: { name: string } } }[];
  store: { name: string } | null;
};
const longDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

function DetailsDialog({ row, onClose, onEdit }: { row: Row; onClose: () => void; onEdit: () => void }) {
  const [data, setData] = useState<Detail | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    api<Detail>(`/api/entries/${row.id}`).then((r) => (r.ok ? setData(r.data) : setErro(r.erro)));
  }, [row.id]);
  const e = data?.entry;
  const credit = row.points > 0;
  const det = (e?.details ?? {}) as { cashReferenceCents?: number | null; passengers?: number | null; reservation?: string | null; origin?: string | null; destination?: string | null; startDate?: string | null; endDate?: string | null; parityFrom?: number; parityTo?: number };
  const costTotal = e?.costs.reduce((t, c) => t + c.amountCents, 0) ?? 0;
  const cpm = credit && row.costCents > 0 ? Math.round((row.costCents * 1000) / row.points) : null;
  const line = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-4 py-2 text-sm"><span className="text-muted">{label}</span><span className="text-right font-medium tabular-nums">{value}</span></div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Detalhes do lançamento"
      footer={<>{!row.grouped && <button className="btn-ghost mr-auto" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</button>}<button className="btn-primary" onClick={onClose}>Fechar</button></>}
    >
      {erro && <Alert>{erro}</Alert>}
      <div className="space-y-4">
        <div>
          <p className="flex items-center gap-2 text-lg font-semibold"><EntryIcon type={row.type} />{row.description}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${credit ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>{credit ? "Crédito" : "Débito"}</span>
            {row.status === "PENDING" && <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-300">A receber</span>}
            {row.ignored && <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs font-semibold text-muted">Ignorado nos relatórios</span>}
            <span className="flex items-center gap-1.5"><ProgramDot color={row.color} />{row.program} {row.holder}</span>
            <span>·</span>
            <span>{ENTRY_LABELS[row.type]}</span>
          </div>
        </div>
        {data?.recurrence && (
          <div className="flex items-start gap-3 rounded-xl border border-line bg-panel2/60 p-3 text-sm">
            <Repeat className="mt-0.5 h-4 w-4 shrink-0 text-accent-light" />
            <div><p className="font-semibold">Lançamento recorrente</p><p className="text-muted">Gerado automaticamente por “{data.recurrence.description}”{data.recurrence.active ? "" : " (recorrência encerrada)"}</p></div>
          </div>
        )}
        <section>
          <p className="kicker mb-1">Detalhes</p>
          <div className="divide-y divide-line">
            {line("Pontos", <span className={credit ? "text-ok" : "text-bad"}>{fmtSignedPts(row.points)}</span>)}
            {line("Data", longDate(row.date))}
            {data?.store && line("Loja parceira", data.store.name)}
            {det.parityFrom && line("Paridade", `${det.parityFrom}:${det.parityTo}`)}
            {det.cashReferenceCents != null && line("Valor de referência", fmtBRL(det.cashReferenceCents))}
            {det.passengers != null && line("Passageiros", det.passengers)}
            {det.reservation && line("Reserva", det.reservation)}
            {(det.origin || det.destination) && line("Trecho", `${det.origin ? airportLabel(det.origin) : "—"} → ${det.destination ? airportLabel(det.destination) : "—"}`)}
            {det.startDate && line("Início", fmtDate(det.startDate))}
            {det.endDate && line("Fim", fmtDate(det.endDate))}
          </div>
        </section>
        {e && e.costs.length > 0 && (
          <section>
            <p className="kicker mb-1 flex items-center gap-1.5"><Receipt className="h-3.5 w-3.5" />Detalhamento de custos</p>
            <div className="divide-y divide-line">
              {e.costs.map((c) => line(`${COST_LABELS[c.type as CostType] ?? c.type}${c.card ? ` · ${c.card.name}` : ""}`, fmtBRL(c.amountCents)))}
              {e.costs.length > 1 && line("Total", fmtBRL(costTotal))}
            </div>
          </section>
        )}
        <section className="divide-y divide-line">
          {credit && line("Custo dos pontos", row.costCents > 0 ? fmtBRL(row.costCents) : "Orgânico")}
          {!credit && row.costCents !== 0 && line("Custo que saiu da conta", fmtBRL(Math.abs(row.costCents)))}
          {cpm != null && line("CPM", fmtBRL(cpm))}
        </section>
        {data && data.legs.length > 0 && (
          <section>
            <p className="kicker mb-1">Outras partes da operação</p>
            <ul className="divide-y divide-line">
              {data.legs.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2 text-sm">
                  <EntryIcon type={l.type} />
                  <span className="min-w-0 flex-1 truncate">{ENTRY_LABELS[l.type]} · {l.account.program.name} {l.account.holder.name}{l.status === "PENDING" && <span className="text-amber-300"> · a receber</span>}</span>
                  <span className={`font-semibold tabular-nums ${l.points > 0 ? "text-ok" : "text-bad"}`}>{fmtSignedPts(l.points)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {!data && !erro && <p className="py-4 text-center text-sm text-muted">Carregando…</p>}
      </div>
    </Modal>
  );
}

/* ---------------- Editar ---------------- */

function EditDialog({ row, cards, onClose }: { row: Row; cards: CardOpt[]; onClose: () => void }) {
  const router = useRouter();
  const nav = useNav();
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const types = costTypesFor(row.type);
  const [costs, setCosts] = useState<CostRow[] | null>(types.length ? null : []);
  const [pay, setPay] = useState<PayState>(emptyPay);
  const credit = row.points > 0;
  useEffect(() => {
    if (!types.length) return;
    api<Detail>(`/api/entries/${row.id}`).then((r) => {
      if (!r.ok) return setErro(r.erro);
      let list = r.data.entry.costs;
      // Compra parcelada: mostra o valor cheio nas linhas e refaz o parcelamento salvo
      const p = (r.data.entry.details as { payment?: { installments: number; anticipated: boolean; nominalCents: number; paidCents: number } } | null)?.payment;
      if (credit && p) {
        list = scaleCosts(list, p.nominalCents);
        const first = planCost(p.nominalCents, { installments: p.installments, anticipate: false, payoffCents: null }).firstCents;
        setPay({ installments: p.installments, anticipate: p.anticipated, payoff: p.anticipated ? ((p.paidCents - first) / 100).toFixed(2).replace(".", ",") : "" });
      }
      // Lançamento antigo sem itens: o custo vira uma linha "Outros" para não se perder
      if (!list.length && row.points > 0 && row.inputCostCents > 0) return setCosts([{ type: types.includes("OUTROS") ? "OUTROS" : types[0]!, amount: (row.inputCostCents / 100).toFixed(2).replace(".", ","), cardId: "" }]);
      setCosts(list.length ? list.map((c) => ({ type: c.type as CostType, amount: (c.amountCents / 100).toFixed(2).replace(".", ","), cardId: c.card?.id ?? "" })) : [emptyCost()]);
    });
  }, [row.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = { points: Number(String(f.get("points")).replace(/\D/g, "")), occurredAt: f.get("date"), description: f.get("description") };
    if (costs && types.length) {
      const c = costsPayload(costs);
      if (c.erro) return setErro(c.erro);
      body.costs = c.items;
      if (credit) {
        const nominal = c.items.reduce((t, x) => t + x.amountCents, 0);
        const plan = toPlan(pay);
        const r = planCost(nominal, plan);
        if (pay.installments > 1 && pay.anticipate && (plan.payoffCents == null || plan.payoffCents > r.restCents)) return setErro("Valor para quitar as parcelas inválido");
        body.costs = scaleCosts(c.items, r.effectiveCents);
        body.payment = paymentDetail(pay, nominal);
      }
    }
    setBusy(true);
    const res = await api(`/api/entries/${row.id}`, "PATCH", body);
    setBusy(false);
    if (!res.ok) return setErro(res.erro);
    toast("Lançamento atualizado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Editar lançamento"
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="edit-entry" className="btn-primary" disabled={busy || costs === null}>Salvar</button></>}
    >
      <form id="edit-entry" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
        <p className="text-sm text-muted sm:col-span-2"><span className="inline-flex items-center gap-1.5"><EntryIcon type={row.type} />{ENTRY_LABELS[row.type]}</span> · {row.program} {row.holder}</p>
        <Field label="Pontos" required><input className="input" name="points" defaultValue={fmtPts(Math.abs(row.points))} inputMode="numeric" required /></Field>
        <Field label="Data" required><input className="input" type="date" name="date" defaultValue={row.date.slice(0, 10)} required /></Field>
        <Field label="Descrição" className="sm:col-span-2"><input className="input" name="description" defaultValue={row.description} maxLength={200} /></Field>
        {types.length > 0 && (
          <div className="sm:col-span-2">
            <span className="label">{row.points > 0 ? "Custos" : "Custos do resgate"}</span>
            {costs ? <CostRows rows={costs} setRows={setCosts} types={types} cards={cards} /> : <p className="text-sm text-muted">Carregando custos…</p>}
            {costs && credit && <div className="mt-3"><PaymentFields totalCents={costsPayload(costs).items.reduce((t, x) => t + x.amountCents, 0)} value={pay} onChange={setPay} /></div>}
          </div>
        )}
      </form>
    </Modal>
  );
}
