"use client";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";

export function Modal({
  open, onClose, title, children, footer, size = "md", icon,
}: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; footer?: React.ReactNode; size?: "sm" | "md" | "lg"; icon?: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose costuma ser recriado a cada render; guardado em ref para o efeito (foco inicial) rodar só ao abrir
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]), select, textarea")?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  if (!open) return null;
  const width = size === "sm" ? "sm:max-w-md" : size === "lg" ? "sm:max-w-4xl" : "sm:max-w-2xl";
  return (
    <div className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-black/60 backdrop-blur-sm sm:items-start sm:p-4 sm:pt-[6vh]" onMouseDown={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-2xl border border-line bg-panel shadow-2xl shadow-black/50 sm:animate-pop-in sm:rounded-card ${width}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
          {icon}
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-subtle ml-auto h-8 w-8 px-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, children, hint, required, className }: { label: string; children: React.ReactNode; hint?: string; required?: boolean; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className={`label ${required ? "req" : ""}`}>{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Alert({ kind = "error", children }: { kind?: "error" | "ok" | "info"; children: React.ReactNode }) {
  const cls = kind === "error" ? "border-red-900/60 bg-red-950/30 text-red-200" : kind === "ok" ? "border-green-900/60 bg-green-950/30 text-green-200" : "border-blue-900/60 bg-blue-950/30 text-blue-200";
  return <div role={kind === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Empty({ title, children, icon }: { title: string; children?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      {icon && <div className="flex h-12 w-12 items-center justify-center rounded-full bg-panel2 text-muted">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {children}
    </div>
  );
}

/** Grupo de abas segmentado (como links, para manter a aba na URL). */
export function Segmented({ items, active, center }: { items: { key: string; label: string; href: string }[]; active: string; center?: boolean }) {
  return (
    <div className={`mb-5 flex ${center ? "justify-center" : ""}`}>
      <nav className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist">
        {items.map((it) => (
          <Link
            key={it.key}
            href={it.href}
            role="tab"
            aria-selected={active === it.key}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${active === it.key ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}
          >
            {it.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

export function SegmentedButtons<T extends string>({ items, value, onChange }: { items: { key: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist">
      {items.map((it) => (
        <button
          key={it.key}
          type="button"
          role="tab"
          aria-selected={value === it.key}
          onClick={() => onChange(it.key)}
          className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${value === it.key ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
