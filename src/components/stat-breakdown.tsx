"use client";
// Card de indicador do painel com detalhamento (⇕): saldo, custo, a receber e valor por programa.
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronsUpDown } from "lucide-react";
import { Avatar } from "./stat";

export type BreakdownRow = { label: string; note?: string; value: string; color?: string };
export type BreakdownGroup = { name: string; count?: number; value?: string; rows: BreakdownRow[] };
export type Breakdown = { title: string; groups: BreakdownGroup[]; footer?: { label: string; value: string }; empty?: string };

export function StatBreakdown({ label, value, hint, breakdown }: { label: string; value: string; hint?: string; breakdown: Breakdown }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pos) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      if (e instanceof MouseEvent && (pop.current?.contains(e.target as Node) || btn.current?.contains(e.target as Node))) return;
      setPos(null);
    };
    const onScroll = () => setPos(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", close);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", onScroll);
    };
  }, [pos]);

  function toggle() {
    if (pos) return setPos(null);
    const r = btn.current!.getBoundingClientRect();
    const width = Math.min(380, window.innerWidth - 16);
    setPos({ top: r.bottom + 8, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) });
  }

  return (
    <div className="card card-pad">
      <button ref={btn} type="button" onClick={toggle} aria-expanded={!!pos} aria-haspopup="dialog" className="kicker flex items-center gap-1.5 text-left hover:text-zinc-100">
        {label}
        <ChevronsUpDown className="h-3.5 w-3.5" aria-hidden />
      </button>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
      {pos &&
        createPortal(
          <div
            ref={pop}
            role="dialog"
            aria-label={breakdown.title}
            className="fixed z-[60] max-h-[70vh] w-[min(380px,calc(100vw-16px))] animate-pop-in overflow-y-auto rounded-2xl border border-line bg-panel p-3 shadow-2xl shadow-black/40"
            style={{ top: pos.top, left: pos.left }}
          >
            <p className="px-1 pb-2 text-xs font-semibold text-muted">{breakdown.title}</p>
            {breakdown.groups.length === 0 && <p className="px-1 py-3 text-sm text-muted">{breakdown.empty ?? "Nada por aqui."}</p>}
            <div className="space-y-2">
              {breakdown.groups.map((g) => (
                <div key={g.name}>
                  <div className="flex items-center gap-2 px-1 py-1 text-xs">
                    {g.count != null ? <Avatar name={g.name} size="sm" /> : null}
                    <span className={`flex-1 truncate font-semibold ${g.count == null ? "uppercase tracking-wide text-muted" : ""}`}>
                      {g.name}
                      {g.count != null && <span className="font-normal text-muted"> ({g.count})</span>}
                    </span>
                    {g.value && <span className="tabular-nums text-muted">{g.value}</span>}
                  </div>
                  {g.rows.length === 0 ? (
                    <p className="px-1 text-sm text-muted">Nenhum</p>
                  ) : (
                    <ul>
                      {g.rows.map((r, i) => (
                        <li key={i} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-panel2">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color ?? "transparent" }} aria-hidden />
                          <span className="min-w-0 flex-1 truncate">
                            {r.label}
                            {r.note && <span className="ml-1.5 text-xs text-muted">· {r.note}</span>}
                          </span>
                          <span className="font-semibold tabular-nums">{r.value}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
            {breakdown.footer && (
              <div className="mt-2 flex items-center justify-between border-t border-line px-1 pt-2 text-sm">
                <span className="text-muted">{breakdown.footer.label}</span>
                <span className="font-semibold tabular-nums">{breakdown.footer.value}</span>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}
