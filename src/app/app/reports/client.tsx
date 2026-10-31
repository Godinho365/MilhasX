"use client";
import Link from "next/link";
import { useNav } from "@/lib/nav";
import { useState } from "react";
import { FileDown, FilterX } from "lucide-react";

type Opt = { id: string; name: string };

/** Barra dos relatórios: período (Dia, Semana, Mês, 3M, 6M, 12M, ano, Tudo, Personalizado), programa, Exportar e Limpar. */
export function ReportToolbar({ tab, sp, programs, exportHref, hidePeriod = false }: { tab: string; sp: Record<string, string>; programs: Opt[]; exportHref: string; hidePeriod?: boolean }) {
  const nav = useNav();
  const year = new Date().getFullYear();
  const periods: [string, string][] = [["dia", "Dia"], ["semana", "Semana"], ["mes", "Mês"], ["3m", "3M"], ["6m", "6M"], ["12m", "12M"], ["ytd", String(year)], ["all", "Tudo"], ["custom", "Personalizado"]];
  const active = sp.periodo ?? "3m";
  const [custom, setCustom] = useState({ de: sp.de ?? "", ate: sp.ate ?? "" });
  const href = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    return `/app/reports/${tab}?${u.toString()}`;
  };
  const seg = (on: boolean) => `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${on ? "bg-accent text-white shadow-sm" : "text-muted hover:text-zinc-100"}`;

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!hidePeriod && (
          <nav className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Período">
            {periods.map(([k, l]) => (
              <Link key={k} role="tab" aria-selected={active === k} href={href({ periodo: k === "3m" ? null : k, ...(k === "custom" ? {} : { de: null, ate: null }) })} className={`shrink-0 ${seg(active === k)}`}>{l}</Link>
            ))}
          </nav>
        )}
        <select className="input w-full sm:w-56" value={sp.programa ?? ""} aria-label="Programa" onChange={(e) => nav(href({ programa: e.target.value || null }))}>
          <option value="">Todos os programas</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="flex gap-2 sm:ml-auto">
          <a className="btn-ghost h-10" href={exportHref}><FileDown className="h-4 w-4" />Exportar</a>
          <Link className="btn-ghost h-10" href={`/app/reports/${tab}`}><FilterX className="h-4 w-4" />Limpar</Link>
        </div>
      </div>
      {!hidePeriod && active === "custom" && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            nav(href({ periodo: "custom", de: custom.de || null, ate: custom.ate || null }));
          }}
        >
          <label className="text-sm"><span className="label">De</span><input className="input" type="date" value={custom.de} onChange={(e) => setCustom({ ...custom, de: e.target.value })} /></label>
          <label className="text-sm"><span className="label">Até</span><input className="input" type="date" value={custom.ate} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} /></label>
          <button className="btn-primary h-10">Aplicar</button>
        </form>
      )}
    </div>
  );
}
