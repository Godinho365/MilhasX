"use client";
// Balcão MilhasX: as encerradas (negociações e propostas) num bloco recolhido, para a lista não ficar comprida: filtro
// (concluídas ou não), busca pelo número, poucas de cada vez com "ver mais", e limpar (uma a uma ou todas), que tira
// da lista as que já estão encerradas. Limpar só some do MilhasX (fica guardado na conta, vale para a equipe e outros aparelhos); no Balcão e
// no bot continuam. As limpas podem ser vistas e trazidas de volta.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Eye, EyeOff, Search, Trash2, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast, confirmDialog } from "@/components/feedback";

export type HiddenKind = "negociacoes" | "propostas";
type Hidden = Record<HiddenKind, number[]>;

const FIRST = 5; // quantas aparecem ao abrir
const MORE = 10; // quantas a mais a cada "ver mais"

/** As encerradas limpas desta conta (um tipo). `setHidden` grava no servidor e devolve se deu certo. */
export function useHidden(kind: HiddenKind) {
  const [ids, setIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    let alive = true;
    void api<{ item: Hidden }>("/api/balcao/hidden").then((r) => { if (alive && r.ok) setIds(new Set(r.data.item[kind])); });
    return () => { alive = false; };
  }, [kind]);
  const setHidden = useCallback(async (list: number[], hide: boolean) => {
    const r = await api<{ item: Hidden }>("/api/balcao/hidden", "POST", { tipo: kind, ids: list, ocultar: hide });
    if (!r.ok) { toast(r.erro, "error"); return false; }
    setIds(new Set(r.data.item[kind]));
    return true;
  }, [kind]);
  return { hidden: ids, setHidden };
}

type Filter = "todas" | "ok" | "nao";

export function ClosedSection<T>({ kind, items, idOf, numberOf, done, labels, render, hidden, setHidden, canEdit, openId }: {
  kind: HiddenKind;
  items: T[]; // todas as encerradas (limpas ou não), mais recentes primeiro
  idOf: (t: T) => number; // o id guardado ao limpar
  numberOf: (t: T) => number; // o número mostrado no cartão (#21), para a busca
  done: (t: T) => boolean; // concluída (fechou negócio)
  labels: { ok: string; nao: string };
  render: (list: T[], action: (t: T) => ReactNode) => ReactNode; // action: o botão de limpar (ou trazer de volta) de cada uma
  hidden: Set<number>;
  setHidden: (ids: number[], hide: boolean) => Promise<boolean>;
  canEdit: boolean;
  openId?: number | null; // a que está aberta: se for uma encerrada, o bloco já abre
}) {
  const noun = kind === "negociacoes" ? "negociações" : "propostas";
  const [open, setOpen] = useState(() => openId != null && items.some((t) => idOf(t) === openId));
  const [filter, setFilter] = useState<Filter>("todas");
  const [shown, setShown] = useState(FIRST);
  const [showHidden, setShowHidden] = useState(false);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  const visible = useMemo(() => items.filter((t) => !hidden.has(idOf(t))), [items, hidden, idOf]);
  const cleared = useMemo(() => items.filter((t) => hidden.has(idOf(t))), [items, hidden, idOf]);
  const base = showHidden ? cleared : visible;
  const counts = useMemo(() => ({ ok: base.filter(done).length, nao: base.filter((t) => !done(t)).length }), [base, done]);
  const digits = query.replace(/\D/g, "");
  const filtered = base.filter((t) => (filter === "todas" || done(t) === (filter === "ok")) && (!digits || String(numberOf(t)).includes(digits)));
  const page = filtered.slice(0, shown);

  useEffect(() => { setShown(FIRST); }, [filter, showHidden, digits]);
  useEffect(() => { if (showHidden && !cleared.length) setShowHidden(false); }, [showHidden, cleared.length]);

  if (!items.length) return null;

  async function clearAll() {
    const ids = visible.map(idOf);
    if (!ids.length) return;
    if (!(await confirmDialog({
      title: `Limpar ${ids.length} ${noun} encerrada(s)?`,
      body: `Elas saem desta lista no MilhasX. No Balcão e no bot continuam como estão, e dá para trazer de volta em "Ver limpas".`,
      confirmLabel: "Limpar",
    }))) return;
    setBusy(true);
    let ok = true;
    for (let i = 0; i < ids.length && ok; i += 500) ok = await setHidden(ids.slice(i, i + 500), true);
    setBusy(false);
    if (ok) toast(`${ids.length} ${noun} encerrada(s) limpa(s) da lista`);
  }

  async function one(t: T, hide: boolean) {
    setBusy(true);
    const ok = await setHidden([idOf(t)], hide);
    setBusy(false);
    if (ok) toast(hide ? `#${numberOf(t)} limpa da lista` : `#${numberOf(t)} de volta à lista`);
  }
  const action = (t: T) => !canEdit ? null : (
    <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); void one(t, !showHidden); }}
      title={showHidden ? "Trazer de volta à lista" : "Limpar da lista"} aria-label={showHidden ? `Trazer #${numberOf(t)} de volta à lista` : `Limpar #${numberOf(t)} da lista`}
      className="rounded p-1 text-muted hover:bg-panel2 hover:text-zinc-100 disabled:opacity-50">
      {showHidden ? <Undo2 className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
    </button>
  );

  async function restore(list: T[]) {
    const ids = list.map(idOf);
    setBusy(true);
    let ok = true;
    for (let i = 0; i < ids.length && ok; i += 500) ok = await setHidden(ids.slice(i, i + 500), false);
    setBusy(false);
    if (ok) toast(`${ids.length} ${noun} de volta à lista`);
  }

  const chip = (key: Filter, label: string, n: number) => (
    <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${filter === key ? "border-accent text-zinc-100" : "border-line text-muted hover:text-zinc-100"}`}>
      {label} ({n})
    </button>
  );

  return (
    <details className="pt-1" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer select-none text-xs text-muted">
        Encerradas ({visible.length}){cleared.length > 0 && ` · ${cleared.length} limpa(s)`}
      </summary>
      <div className="mt-2 space-y-2">
        {showHidden && <p className="text-xs text-muted">Mostrando as {noun} limpas da lista.</p>}
        {base.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chip("todas", "Todas", base.length)}
            {counts.ok > 0 && chip("ok", labels.ok, counts.ok)}
            {counts.nao > 0 && chip("nao", labels.nao, counts.nao)}
            {base.length > FIRST && (
              <label className="ml-auto inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-xs text-muted focus-within:border-accent">
                <Search className="h-3 w-3" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} inputMode="numeric" placeholder="Nº" aria-label="Buscar pelo número"
                  className="w-12 bg-transparent text-zinc-100 outline-none placeholder:text-muted" />
              </label>
            )}
          </div>
        )}
        {page.length ? render(page, action) : <p className="text-xs text-muted">{digits ? `Nenhuma com o nº ${digits}.` : showHidden ? "Nenhuma limpa." : "Nenhuma encerrada na lista."}</p>}
        {filtered.length > shown && (
          <button type="button" className="btn-ghost w-full justify-center text-xs" onClick={() => setShown((n) => n + MORE)}>
            Ver mais ({filtered.length - shown})
          </button>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-1 text-xs">
          {!showHidden && canEdit && visible.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void clearAll()} className="inline-flex items-center gap-1 text-muted hover:text-zinc-100 disabled:opacity-50">
              <Trash2 className="h-3.5 w-3.5" />Limpar encerradas
            </button>
          )}
          {cleared.length > 0 && (
            <button type="button" onClick={() => setShowHidden((v) => !v)} className="inline-flex items-center gap-1 text-muted hover:text-zinc-100">
              {showHidden ? <><EyeOff className="h-3.5 w-3.5" />Voltar às encerradas</> : <><Eye className="h-3.5 w-3.5" />Ver limpas ({cleared.length})</>}
            </button>
          )}
          {showHidden && canEdit && cleared.length > 0 && (
            <button type="button" disabled={busy} onClick={() => void restore(cleared)} className="inline-flex items-center gap-1 text-muted hover:text-zinc-100 disabled:opacity-50">
              <Undo2 className="h-3.5 w-3.5" />Trazer todas de volta
            </button>
          )}
        </div>
      </div>
    </details>
  );
}
