"use client";
// Cartões da conta com "Organizar": escolher quais aparecem e arrastar para mudar a ordem.
// A escolha fica guardada neste navegador e vale para todas as contas.
import { useEffect, useMemo, useState } from "react";
import { Wallet, Package, DollarSign, Percent, CreditCard, Users, Calculator, CalendarDays, TrendingUp, GripVertical, Search, Eye, EyeOff, X, SlidersHorizontal } from "lucide-react";
import { Switch } from "@/components/form-parts";

const ICONS = { wallet: Wallet, package: Package, dollar: DollarSign, percent: Percent, card: CreditCard, users: Users, calc: Calculator, calendar: CalendarDays, trend: TrendingUp } as const;
export type Card = { key: string; label: string; value: string; sub: string; icon: keyof typeof ICONS; tone?: string };

const STORE = "mm:account-cards";
type Saved = { order: string[]; hidden: string[] };

/** Abre o painel "Organizar métricas" (botão Organizar do cabeçalho da conta). */
export const openOrganizer = () => window.dispatchEvent(new Event("mm:organize-cards"));

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? "null") as Saved | null;
    if (v && Array.isArray(v.order) && Array.isArray(v.hidden)) return v;
  } catch {}
  return { order: [], hidden: [] };
}

/** Ordem salva primeiro; cartões novos (ainda não organizados) entram no fim. */
const arrange = (cards: Card[], order: string[]) => [...cards].sort((a, b) => {
  const ia = order.indexOf(a.key), ib = order.indexOf(b.key);
  return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
});

export function CardsGrid({ cards }: { cards: Card[] }) {
  const [saved, setSaved] = useState<Saved>({ order: [], hidden: [] });
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setSaved(load());
    const onOpen = () => setOpen(true);
    window.addEventListener("mm:organize-cards", onOpen);
    return () => window.removeEventListener("mm:organize-cards", onOpen);
  }, []);
  const shown = arrange(cards, saved.order).filter((c) => !saved.hidden.includes(c.key));
  function save(v: Saved) {
    setSaved(v);
    try { localStorage.setItem(STORE, JSON.stringify(v)); } catch {}
  }
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {shown.map((c) => {
          const Icon = ICONS[c.icon];
          return (
            <div key={c.key} className="card card-pad">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-muted">{c.label}</p>
                <Icon className="h-5 w-5 text-muted" aria-hidden />
              </div>
              <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${c.tone ?? ""}`}>{c.value}</p>
              <p className="mt-0.5 text-xs text-muted">{c.sub}</p>
            </div>
          );
        })}
        {shown.length === 0 && <button type="button" className="card card-pad col-span-full text-sm text-muted hover:text-zinc-100" onClick={() => setOpen(true)}>Todos os cartões estão ocultos. Clique para organizar.</button>}
      </div>
      {open && <Organizer cards={cards} saved={saved} onClose={() => setOpen(false)} onSave={(v) => { save(v); setOpen(false); }} />}
    </>
  );
}

function Organizer({ cards, saved, onClose, onSave }: { cards: Card[]; saved: Saved; onClose: () => void; onSave: (v: Saved) => void }) {
  const [order, setOrder] = useState(() => arrange(cards, saved.order).map((c) => c.key));
  const [hidden, setHidden] = useState(saved.hidden);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<string | null>(null);
  const byKey = useMemo(() => new Map(cards.map((c) => [c.key, c])), [cards]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const visible = order.filter((k) => !hidden.includes(k)).length;
  const term = q.trim().toLowerCase();
  const list = order.filter((k) => !term || byKey.get(k)!.label.toLowerCase().includes(term));
  function moveOver(target: string) {
    if (!drag || drag === target) return;
    const n = order.filter((k) => k !== drag);
    n.splice(n.indexOf(target), 0, drag);
    setOrder(n);
  }
  const move = (k: string, d: number) => {
    const i = order.indexOf(k), j = i + d;
    if (j < 0 || j >= order.length) return;
    const n = [...order];
    [n[i], n[j]] = [n[j]!, n[i]!];
    setOrder(n);
  };
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="flex h-full w-full max-w-sm animate-pop-in flex-col border-l border-line bg-panel shadow-2xl" role="dialog" aria-label="Organizar métricas da conta">
        <div className="border-b border-line p-5">
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <h2 className="text-lg font-semibold">Organizar métricas da conta</h2>
              <p className="text-sm text-muted">Escolha quais cartões aparecem e arraste para mudar a ordem.</p>
            </div>
            <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
          <span className="mt-2 inline-block rounded-full bg-panel2 px-2.5 py-0.5 text-xs font-medium">{visible} de {order.length} visíveis</span>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar métrica..." aria-label="Buscar métrica" />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost h-9 border border-line" onClick={() => setHidden([])}><Eye className="h-4 w-4" />Mostrar todas</button>
            <button type="button" className="btn-ghost h-9 border border-line" onClick={() => setHidden([...order])}><EyeOff className="h-4 w-4" />Ocultar todas</button>
          </div>
        </div>
        <ul className="flex-1 space-y-2 overflow-y-auto p-4" aria-label="Métricas">
          {list.map((k) => {
            const c = byKey.get(k)!;
            const on = !hidden.includes(k);
            return (
              <li key={k} draggable onDragStart={() => setDrag(k)} onDragEnter={() => moveOver(k)} onDragOver={(e) => e.preventDefault()} onDragEnd={() => setDrag(null)}
                onKeyDown={(e) => { if (e.altKey && e.key === "ArrowUp") { e.preventDefault(); move(k, -1); } if (e.altKey && e.key === "ArrowDown") { e.preventDefault(); move(k, 1); } }}
                className={`flex items-center gap-2 rounded-xl border border-line bg-panel2/50 px-3 py-2.5 ${drag === k ? "opacity-50" : ""}`}>
                <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted" aria-hidden />
                <div className="min-w-0 flex-1"><Switch checked={on} onChange={(v) => setHidden(v ? hidden.filter((x) => x !== k) : [...hidden, k])} label={c.label} /></div>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line p-4">
          <button type="button" className="btn-primary h-10 w-full" onClick={() => onSave({ order, hidden })}>Salvar</button>
        </div>
      </aside>
    </div>
  );
}

export function OrganizeButton() {
  return <button type="button" className="btn-ghost ml-auto h-9 border border-line bg-panel" onClick={openOrganizer}><SlidersHorizontal className="h-4 w-4" />Organizar</button>;
}
