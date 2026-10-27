"use client";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Layers, User, Check, ChevronsUpDown, Loader2, SlidersHorizontal } from "lucide-react";
import { selectHolder } from "@/app/app/actions";
import { Avatar } from "./stat";
import { toast } from "./feedback";

export type HolderOpt = { id: string; name: string; isSelf: boolean };

/** Seletor global de titular: "Visualizar" (todos / minhas contas) e a lista de titulares. */
export function HolderPicker({ holders, value }: { holders: HolderOpt[]; value: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const self = holders.find((h) => h.isSelf);
  const chosen = value && value !== "self" ? holders.find((h) => h.id === value) : undefined;
  const label = value === "" ? "Todos os titulares" : value === "self" ? "Minhas contas" : holders.find((h) => h.id === value)?.name ?? "Todos os titulares";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") return setOpen(false);
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      e.preventDefault();
      const items = [...(listRef.current?.querySelectorAll<HTMLButtonElement>("[role=option]:not([aria-disabled=true])") ?? [])];
      const i = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    listRef.current?.querySelector<HTMLButtonElement>("[aria-selected=true]")?.focus();
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(v: string) {
    setOpen(false);
    if (v === value) return;
    start(async () => {
      const r = await selectHolder(v);
      if (!r.ok) return toast(r.erro, "error");
      // Recarrega por completo: todas as telas dependem do titular e não podem ficar com dado em cache
      window.location.reload();
    });
  }

  const item = (v: string, text: string, icon: React.ReactNode, disabled = false, hint?: string) => (
    <button
      key={v || "all"}
      role="option"
      aria-selected={v === value}
      aria-disabled={disabled}
      title={hint}
      onClick={() => !disabled && pick(v)}
      className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-panel2 ${v === value ? "bg-panel2" : "hover:bg-panel2/70"} ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{text}</span>
      {v === value && <Check className="h-4 w-4 shrink-0 text-accent-light" />}
    </button>
  );

  return (
    <div className="relative" ref={ref}>
      <button
        className="pill max-w-[44px] justify-center px-0 sm:max-w-none sm:justify-start sm:px-3"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Trocar titular: ${label}`}
        disabled={pending}
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : chosen ? (
          <Avatar name={chosen.name} size="sm" />
        ) : value === "self" ? (
          <User className="h-4 w-4 shrink-0 text-zinc-300" />
        ) : (
          <Layers className="h-4 w-4 shrink-0 text-zinc-300" />
        )}
        <span className="hidden max-w-[160px] truncate sm:inline">{label}</span>
        <ChevronsUpDown className="hidden h-3.5 w-3.5 shrink-0 text-muted sm:block" />
      </button>
      {open && (
        <div ref={listRef} role="listbox" aria-label="Trocar titular" className="absolute right-0 top-full z-40 mt-2 max-h-[min(70vh,420px)] w-64 animate-pop-in overflow-y-auto rounded-2xl border border-line bg-panel p-1.5 shadow-2xl shadow-black/50">
          <p className="px-2.5 pb-1 pt-1.5 text-xs font-medium text-muted">Visualizar</p>
          {item("", "Todos os titulares", <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel2"><Layers className="h-4 w-4 text-zinc-300" /></span>)}
          {item(
            "self",
            "Minhas contas",
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-panel2"><User className="h-4 w-4 text-zinc-300" /></span>,
            !self,
            self ? undefined : "Marque em Programas › Titulares qual titular é você",
          )}
          {!self && (
            <Link href="/app/programs?view=titulares" onClick={() => setOpen(false)} className="block px-2.5 pb-1 text-xs text-accent-light hover:underline">
              Definir qual titular é você
            </Link>
          )}
          {holders.length > 0 && (
            <>
              <div className="my-1.5 border-t border-line" />
              <p className="px-2.5 pb-1 pt-1 text-xs font-medium text-muted">Titulares</p>
              {holders.map((h) => item(h.id, h.name, <Avatar name={h.name} />))}
            </>
          )}
          <div className="my-1.5 border-t border-line" />
          <Link href="/app/programs?view=titulares" onClick={() => setOpen(false)} className="flex w-full items-center gap-3 rounded-lg bg-panel2/60 px-2.5 py-2 text-sm font-medium outline-none hover:bg-panel2 focus-visible:bg-panel2">
            <SlidersHorizontal className="h-4 w-4 text-muted" />Gerenciar titulares
          </Link>
        </div>
      )}
    </div>
  );
}
