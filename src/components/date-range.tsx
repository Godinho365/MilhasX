"use client";
// Seletor de período: setas de mês e um calendário com atalhos (clique no dia inicial e depois no final).
import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { today } from "@/lib/api";
import { type DayRange, MONTHS, WEEKDAYS, addDays, addMonths, brShort, monthRange, monthStart, rangeLabel, shortcuts, toDate } from "@/lib/day-range";

export type { DayRange };
export { rangeLabel };

export function DateRangePicker({ value, onChange, align = "left" }: { value: DayRange; onChange: (r: DayRange) => void; align?: "left" | "right" }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  // setas: mês anterior/seguinte ao do início do período (sem período, parte do mês atual)
  const step = (n: number) => onChange(monthRange(addMonths(value?.from ?? today(), n)));

  return (
    <div ref={box} className="relative flex items-center gap-1 rounded-xl border border-line bg-panel px-1">
      <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => step(-1)} aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></button>
      <button type="button" className="min-w-[150px] px-2 text-center text-sm font-semibold first-letter:uppercase" onClick={() => setOpen((o) => !o)} aria-label="Escolher período">{rangeLabel(value)}</button>
      <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => step(1)} aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></button>
      <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => setOpen((o) => !o)} aria-label="Abrir calendário" aria-expanded={open}><CalendarDays className="h-4 w-4" /></button>
      {open && <Popover value={value} align={align} onPick={(r) => { onChange(r); setOpen(false); }} />}
    </div>
  );
}

function Popover({ value, onPick, align }: { value: DayRange; onPick: (r: DayRange) => void; align: "left" | "right" }) {
  const t = today();
  const [view, setView] = useState(monthStart(value?.from ?? t)); // mês mostrado
  const [start, setStart] = useState<string | null>(null); // 1º clique, esperando o dia final
  const [hover, setHover] = useState<string | null>(null);

  const first = toDate(view);
  const gridStart = addDays(view, -first.getUTCDay()); // domingo antes do dia 1
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const sel = start ? { from: hover && hover < start ? hover : start, to: hover && hover > start ? hover : start } : value;
  const year = Number(view.slice(0, 4));

  function click(d: string) {
    if (!start) return setStart(d);
    onPick(d < start ? { from: d, to: start } : { from: start, to: d });
  }

  return (
    <div className={`absolute ${align === "right" ? "right-0" : "left-0"} top-full z-40 mt-2 flex animate-pop-in overflow-hidden rounded-xl border border-line bg-panel2 shadow-xl shadow-black/40`} role="dialog" aria-label="Escolher período">
      <div className="hidden w-40 border-r border-line p-2 sm:block">
        <p className="px-2 pb-1 text-xs text-muted">Atalhos</p>
        {shortcuts(t).map((s) => (
          <button key={s.label} type="button" className="block w-full rounded-lg px-2 py-1.5 text-left text-sm font-medium hover:bg-line" onClick={() => onPick(s.range)}>{s.label}</button>
        ))}
      </div>
      <div className="w-[300px] p-3">
        <div className="mb-2 flex items-center gap-1">
          <select className="input h-8 w-auto py-0 text-sm font-semibold" value={view.slice(5, 7)} onChange={(e) => setView(`${view.slice(0, 4)}-${e.target.value}-01`)} aria-label="Mês">
            {MONTHS.map((m, i) => <option key={m} value={String(i + 1).padStart(2, "0")}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
          <select className="input h-8 w-auto py-0 text-sm font-semibold" value={year} onChange={(e) => setView(`${e.target.value}-${view.slice(5, 7)}-01`)} aria-label="Ano">
            {Array.from({ length: 8 }, (_, i) => Number(t.slice(0, 4)) - 5 + i).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <span className="flex-1" />
          <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setView(addMonths(view, -1))} aria-label="Mês anterior no calendário"><ChevronLeft className="h-4 w-4" /></button>
          <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setView(addMonths(view, 1))} aria-label="Próximo mês no calendário"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-muted">
          {WEEKDAYS.map((w) => <span key={w} className="py-1">{w}</span>)}
        </div>
        <div className="grid grid-cols-7 gap-y-1" onMouseLeave={() => setHover(null)}>
          {days.map((d) => {
            const inMonth = d.slice(0, 7) === view.slice(0, 7);
            const edge = !!sel && (d === sel.from || d === sel.to);
            const inside = !!sel && d > sel.from && d < sel.to;
            return (
              <button
                key={d}
                type="button"
                onClick={() => click(d)}
                onMouseEnter={() => setHover(d)}
                aria-label={`${brShort(d)}/${d.slice(0, 4)}`}
                aria-pressed={edge}
                className={`h-9 text-sm ${edge ? "rounded-full bg-accent-light font-semibold text-zinc-950" : inside ? "bg-accent-soft/40" : "rounded-full hover:bg-line"} ${inMonth ? "" : "text-zinc-600"} ${d === t && !edge ? "font-bold text-accent-light" : ""}`}
              >
                {Number(d.slice(8, 10))}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-center text-xs text-muted">{start ? `Início em ${brShort(start)}: agora clique no dia final` : "Clique no dia inicial e depois no final"}</p>
        <div className="mt-2 flex flex-wrap gap-1 sm:hidden">
          {shortcuts(t).map((s) => <button key={s.label} type="button" className="btn-ghost h-7 px-2 text-xs" onClick={() => onPick(s.range)}>{s.label}</button>)}
        </div>
      </div>
    </div>
  );
}
