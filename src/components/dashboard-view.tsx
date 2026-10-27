"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LayoutGrid, Wallet, Users, Check, ChevronsUpDown } from "lucide-react";
import { api } from "@/lib/api";
import { VIEWS as BASE, type DashboardView } from "@/lib/dashboard-views";

export type { DashboardView };
const ICONS = { "visao-geral": LayoutGrid, vendas: Wallet, gestao: Users } as const;
const VIEWS = BASE.map((v) => ({ ...v, icon: ICONS[v.key] }));

/** Escolha do modo do painel: painel inferior no celular, menu suspenso no desktop. */
export function DashboardViewPicker({ value }: { value: DashboardView }) {
  const [open, setOpen] = useState(false);
  const urlView = useSearchParams().get("view");
  const initial = BASE.some((v) => v.key === urlView) ? (urlView as DashboardView) : value;
  const [current, setCurrent] = useState(initial);
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const cur = VIEWS.find((v) => v.key === current) ?? VIEWS[2]!;

  useEffect(() => setCurrent(initial), [initial]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !sheetRef.current?.contains(t)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  async function pick(v: DashboardView) {
    setOpen(false);
    if (v === current) return;
    setCurrent(v);
    // Salva o padrão da próxima visita e carrega a página do zero no modo escolhido.
    // Navegação completa de propósito: a troca é rara e assim nunca aparece conteúdo de outro modo em cache.
    await api("/api/preferences", "PATCH", { dashboardView: v });
    window.location.assign(`/app?view=${v}`);
  }

  const options = (
    <ul className="space-y-1" role="listbox" aria-label="Modo do painel">
      {VIEWS.map((v) => (
        <li key={v.key}>
          <button
            role="option"
            aria-selected={v.key === current}
            onClick={() => pick(v.key)}
            className={`flex w-full items-center gap-4 rounded-2xl px-3 py-3 text-left transition-colors ${v.key === current ? "bg-panel2" : "hover:bg-panel2/60"}`}
          >
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${v.key === current ? "bg-accent-soft text-accent-light" : "bg-panel2 text-zinc-300"}`}><v.icon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{v.label}</span>
              <span className="block truncate text-sm text-muted">{v.sub}</span>
            </span>
            {v.key === current && <Check className="h-5 w-5 shrink-0 text-accent-light" />}
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="relative" ref={ref}>
      <button className="pill px-3" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} aria-label={`Modo do painel: ${cur.label}`}>
        <cur.icon className="h-4 w-4 text-zinc-300" />
        <span className="hidden sm:inline">{cur.label}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <>
          {/* Desktop: menu suspenso */}
          <div className="absolute right-0 top-full z-40 mt-2 hidden w-96 animate-pop-in rounded-2xl border border-line bg-panel p-2 shadow-2xl shadow-black/50 sm:block">{options}</div>
          {/* Celular: painel inferior. Vai direto para o <body> para ficar acima da barra inferior e do botão "+"
              (dentro do cabeçalho ele herdaria a camada do cabeçalho e ficaria por baixo deles). */}
          {createPortal(
            <div ref={sheetRef} className="fixed inset-0 z-[60] animate-fade-in bg-black/60 backdrop-blur-md sm:hidden" onClick={() => setOpen(false)}>
              <div className="absolute inset-x-0 bottom-0 animate-slide-up rounded-t-3xl border-t border-line bg-panel px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-3" onClick={(e) => e.stopPropagation()}>
                <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-700" aria-hidden />
                <h2 className="mb-4 text-center text-lg font-semibold">Painel</h2>
                {options}
              </div>
            </div>,
            document.body,
          )}
        </>
      )}
    </div>
  );
}
