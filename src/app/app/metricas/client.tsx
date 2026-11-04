"use client";
// Métricas: barra de abas, navegação por mês, filtros e o "Personalizar" (blocos que aparecem em cada aba).
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { BarChart3, ChevronLeft, ChevronRight, Calendar, SlidersHorizontal, Users, Wallet, RotateCcw } from "lucide-react";
import { useNav, refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { Modal, Alert } from "@/components/ui";
import { Switch } from "@/components/form-parts";
import { toast } from "@/components/feedback";
import { METRICS_BLOCKS, METRICS_TABS, type MetricsTab } from "@/domain/metrics";

const TAB_INFO: Record<MetricsTab, { label: string; icon: typeof BarChart3; subtitle: string }> = {
  vendas: { label: "Vendas", icon: BarChart3, subtitle: "Acompanhe o desempenho das suas vendas" },
  equipe: { label: "Equipe", icon: Users, subtitle: "Acompanhe o resultado de quem emite" },
  contas: { label: "Contas", icon: Wallet, subtitle: "Onde está o capital das suas contas e quanto ele rende" },
};
const SECTION_TITLES: Record<MetricsTab, string> = { vendas: "Métricas das vendas", equipe: "Métricas da equipe", contas: "Métricas das contas" };

type Opt = { id: string; name: string };

export function MetricsHeader({ tab, sp, window: w, hidden, filters }: {
  tab: MetricsTab; sp: Record<string, string>;
  window: { month: string; label: string; prevMonth: string; nextMonth: string | null; current: boolean };
  hidden: string[];
  filters: { customers?: Opt[]; tags?: string[]; members?: Opt[]; programs?: Opt[] };
}) {
  const nav = useNav();
  const [custom, setCustom] = useState(false);
  const href = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(sp);
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    const q = u.toString();
    return `/app/metricas${q ? `?${q}` : ""}`;
  };
  const info = TAB_INFO[tab];
  const sel = "input h-9 w-auto max-w-[220px] text-sm";
  return (
    <div className="mb-5 space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Métricas</h1>
            <nav className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Abas das métricas">
              {METRICS_TABS.map((k) => {
                const I = TAB_INFO[k].icon;
                // trocar de aba mantém o mês; os filtros são de cada aba
                return <Link key={k} role="tab" aria-selected={tab === k} href={`/app/metricas?aba=${k}${sp.mes ? `&mes=${sp.mes}` : ""}`} className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${tab === k ? "bg-accent text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}><I className="h-4 w-4" />{TAB_INFO[k].label}</Link>;
              })}
            </nav>
          </div>
          <p className="mt-1 text-sm text-muted">{info.subtitle}</p>
        </div>
        <button type="button" className="btn-ghost h-9 border border-line" onClick={() => setCustom(true)}><SlidersHorizontal className="h-4 w-4" />Personalizar</button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1 rounded-xl border border-line bg-panel p-1" aria-label="Mês">
          <Calendar className="ml-2 h-4 w-4 text-muted" aria-hidden />
          <Link href={href({ mes: w.prevMonth })} className="btn-subtle h-7 w-7 px-0" aria-label="Mês anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-[150px] text-center text-sm font-medium">{w.label}</span>
          {w.nextMonth ? <Link href={href({ mes: w.nextMonth })} className="btn-subtle h-7 w-7 px-0" aria-label="Próximo mês"><ChevronRight className="h-4 w-4" /></Link> : <span className="h-7 w-7" aria-hidden />}
        </div>
        {!w.current && <Link href={href({ mes: null })} className="btn-ghost h-9 text-sm"><RotateCcw className="h-3.5 w-3.5" />Mês atual</Link>}
        {filters.customers && (
          <select className={sel} value={sp.cliente ?? ""} aria-label="Cliente" onChange={(e) => nav(href({ cliente: e.target.value || null }))}>
            <option value="">Todos os clientes</option>
            {filters.customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {filters.tags && filters.tags.length > 0 && (
          <select className={sel} value={sp.etiqueta ?? ""} aria-label="Etiqueta" onChange={(e) => nav(href({ etiqueta: e.target.value || null }))}>
            <option value="">Todas as etiquetas</option>
            {filters.tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {filters.members && (
          <select className={sel} value={sp.membro ?? ""} aria-label="Emissor" onChange={(e) => nav(href({ membro: e.target.value || null }))}>
            <option value="">Toda a equipe</option>
            {filters.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        )}
        {filters.programs && (
          <select className={sel} value={sp.programa ?? ""} aria-label="Programa" onChange={(e) => nav(href({ programa: e.target.value || null }))}>
            <option value="">Todos os programas</option>
            {filters.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
      </div>
      {custom && <Customize hidden={hidden} onClose={() => setCustom(false)} />}
    </div>
  );
}

/** Personalizar: liga e desliga os blocos de cada aba (salvo para o usuário). */
function Customize({ hidden, onClose }: { hidden: string[]; onClose: () => void }) {
  const router = useRouter();
  const [off, setOff] = useState(new Set(hidden));
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const toggle = (k: string, on: boolean) => setOff((s) => { const n = new Set(s); if (on) n.delete(k); else n.add(k); return n; });
  async function save(keys: string[]) {
    setBusy(true);
    const r = await api("/api/preferences/metrics", "PUT", { hidden: keys });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Métricas personalizadas");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title="Personalizar métricas" icon={<SlidersHorizontal className="h-5 w-5" />}
      footer={<>
        <button type="button" className="btn-ghost mr-auto" disabled={busy} onClick={() => save([])}><RotateCcw className="h-4 w-4" />Mostrar tudo</button>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-primary" disabled={busy} onClick={() => save([...off])}>Salvar</button>
      </>}>
      <p className="mb-4 text-sm text-muted">Escolha os blocos que aparecem em cada aba. Vale só para você.</p>
      {erro && <div className="mb-3"><Alert>{erro}</Alert></div>}
      <div className="space-y-4">
        {METRICS_TABS.map((t) => (
          <section key={t} className="rounded-xl border border-line p-3">
            <h3 className="mb-2 text-sm font-semibold">{SECTION_TITLES[t]}</h3>
            <div className="space-y-2">
              {METRICS_BLOCKS[t].map((b) => <Switch key={b.key} checked={!off.has(b.key)} onChange={(on) => toggle(b.key, on)} label={b.label} />)}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  );
}
