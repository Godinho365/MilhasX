"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { CheckCircle2, Circle, ChevronDown, ListChecks } from "lucide-react";
import { api } from "@/lib/api";
import { openEntryForm } from "@/components/entry-forms";

export function Checklist({ steps, done }: { steps: { key: string; label: string; done: boolean; href: string }[]; done: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  async function hide() {
    await api("/api/preferences", "PATCH", { checklistHidden: true });
    refreshSafe(router);
  }
  return (
    <section className="card mb-4 overflow-hidden" aria-label="Primeiros passos">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-panel2"><ListChecks className="h-4 w-4 text-muted" /></span>
        <div>
          <h2 className="font-semibold">Primeiros passos</h2>
          <p className="text-xs text-muted">{done} de {steps.length} concluídas</p>
        </div>
        <button className="btn-subtle ml-auto h-8 px-2 text-xs" onClick={hide}>Ocultar</button>
        <button className="btn-subtle h-8 w-8 px-0" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Recolher checklist">
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      <div className="mx-5 mb-1 h-1 overflow-hidden rounded-full bg-panel2"><div className="h-full rounded-full bg-accent-light" style={{ width: `${(done / steps.length) * 100}%` }} /></div>
      {open && (
        <ul className="grid gap-x-6 px-3 py-3 sm:grid-cols-2">
          {steps.map((s) => {
            const content = (
              <>
                {s.done ? <CheckCircle2 className="h-[18px] w-[18px] text-ok" /> : <Circle className="h-[18px] w-[18px] text-zinc-600" />}
                <span className={s.done ? "text-muted line-through" : ""}>{s.label}</span>
              </>
            );
            const cls = "flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm hover:bg-panel2";
            return (
              <li key={s.key}>
                {s.key === "entry" || s.key === "transfer" ? (
                  <button className={cls} onClick={() => openEntryForm(s.key === "entry" ? "credit" : "transfer")}>{content}</button>
                ) : (
                  <Link href={s.href} className={cls}>{content}</Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
