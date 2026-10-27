"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeftRight, ShoppingCart, CalendarClock, Store, Sparkles, Search, ExternalLink, Bell, Trash2, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtDate } from "@/lib/format";
import { Field, Alert, Empty } from "@/components/ui";
import { ProgramDot } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";

type Kind = "TRANSFER_BONUS" | "PURCHASE_BONUS" | "CLUB" | "SHOPPING" | "OTHER";
const KIND: Record<Kind, { label: string; icon: React.ComponentType<{ className?: string }>; grad: string }> = {
  TRANSFER_BONUS: { label: "Transferência", icon: ArrowLeftRight, grad: "from-blue-500/40 via-sky-500/20 to-transparent" },
  PURCHASE_BONUS: { label: "Compra de pontos", icon: ShoppingCart, grad: "from-emerald-500/40 via-teal-500/20 to-transparent" },
  CLUB: { label: "Clubes", icon: CalendarClock, grad: "from-violet-500/40 via-fuchsia-500/20 to-transparent" },
  SHOPPING: { label: "Compras", icon: Store, grad: "from-amber-500/40 via-orange-500/20 to-transparent" },
  OTHER: { label: "Outras", icon: Sparkles, grad: "from-zinc-500/40 via-zinc-500/10 to-transparent" },
};

type Promo = {
  id: string; kind: Kind; title: string; description: string | null; bonusPercent: number; url: string | null;
  from: { name: string; color: string } | null; to: { name: string; color: string } | null; endsAt: string; daysLeft: number;
};

const SORT_LABELS = [["ending", "Encerrando primeiro"], ["recent", "Mais recentes"], ["bonus", "Maior bônus"]] as const;

export function PromotionToolbar({ q, kind, programId, sort, history, programs }: { q: string; kind: string; programId: string; sort: string; history: boolean; programs: { id: string; name: string }[] }) {
  const nav = useNav();
  const go = (patch: Record<string, string | null>) => {
    const base: Record<string, string | null> = { tab: history ? "historico" : null, q: q || null, categoria: kind || null, programa: programId || null, ordem: sort !== "ending" ? sort : null, ...patch };
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    nav(`/app/offers${u.size ? `?${u}` : ""}`);
  };
  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap gap-2">
        <form className="relative min-w-0 flex-1 basis-60" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") || "") || null }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" name="q" placeholder="Buscar promoção" defaultValue={q} key={q} aria-label="Buscar promoção" />
        </form>
        <select className="input w-full sm:w-48" value={programId} onChange={(e) => go({ programa: e.target.value || null })} aria-label="Programa">
          <option value="">Todos os programas</option>
          {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {!history && (
          <select className="input w-full sm:w-48" value={sort} onChange={(e) => go({ ordem: e.target.value !== "ending" ? e.target.value : null })} aria-label="Ordenar promoções">
            {SORT_LABELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        )}
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Categoria">
        {([["", "Todas"], ...Object.entries(KIND).map(([k, v]) => [k, v.label])] as [string, string][]).map(([k, l]) => (
          <button key={k || "all"} type="button" aria-pressed={kind === k} onClick={() => go({ categoria: k || null })} className={`rounded-full border px-3 py-1 text-xs font-medium ${kind === k ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{l}</button>
        ))}
      </div>
    </div>
  );
}

export function PromotionGrid({ items, history }: { items: Promo[]; history: boolean }) {
  if (items.length === 0) {
    return <Empty title={history ? "Nenhuma promoção encerrada" : "Nenhuma promoção ativa agora"} icon={<Tag className="h-5 w-5" />}><p className="max-w-sm text-sm text-muted">Crie um alerta para ser avisado quando surgir uma promoção dos seus programas.</p></Empty>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((p) => {
        const k = KIND[p.kind];
        const deadline = history ? `Encerrou em ${fmtDate(p.endsAt)}` : p.daysLeft === 0 ? "Termina hoje" : `Termina em ${p.daysLeft} ${p.daysLeft === 1 ? "dia" : "dias"}`;
        return (
          <article key={p.id} className="card flex flex-col overflow-hidden">
            <div className={`relative flex h-28 items-end bg-gradient-to-br ${k.grad} p-4`}>
              <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-black/50 px-2.5 py-1 text-xs font-semibold backdrop-blur"><k.icon className="h-3.5 w-3.5" />{k.label}</span>
              <span className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold ${!history && p.daysLeft === 0 ? "bg-red-500 text-white" : "bg-black/50 backdrop-blur"}`}>{deadline}</span>
              {p.bonusPercent > 0 && <span className="text-4xl font-bold tracking-tight">{p.bonusPercent}%<span className="ml-1 text-base font-semibold text-zinc-300">de bônus</span></span>}
            </div>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <h3 className="line-clamp-2 font-semibold">{p.title}</h3>
              {p.description && <p className="line-clamp-3 text-sm text-muted">{p.description}</p>}
              <div className="mt-auto flex flex-wrap items-center gap-2">
                {[p.from, p.to].filter((x): x is { name: string; color: string } => !!x).map((x, i) => (
                  <span key={i} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs font-medium"><ProgramDot color={x.color} />{x.name}</span>
                ))}
                {p.url && (
                  <a href={p.url} target="_blank" rel="noopener noreferrer nofollow" className="btn-subtle ml-auto h-8 px-2 text-xs">Ver regras<ExternalLink className="h-3.5 w-3.5" /></a>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

export function PromotionAlerts({ programs, alerts }: { programs: { id: string; name: string }[]; alerts: { id: string; program: string; threshold: number }[] }) {
  const router = useRouter();
  const [erro, setErro] = useState("");
  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await api("/api/alerts", "POST", { type: "PROMOTION", programId: f.get("programId") || undefined, threshold: Number(f.get("threshold") || 0) });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    form.reset();
    toast("Alerta de promoção criado");
    refreshSafe(router);
  }
  async function remove(id: string) {
    if (!(await confirmDialog({ title: "Excluir alerta?", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/alerts/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Alerta excluído");
    refreshSafe(router);
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={create} className="card card-pad space-y-4">
        <h2 className="text-lg font-semibold">Avise-me sobre promoções</h2>
        {erro && <Alert>{erro}</Alert>}
        <Field label="Programa"><select className="input" name="programId"><option value="">Qualquer programa</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Bônus mínimo (%)" hint="Use 0 para ser avisado de qualquer promoção"><input className="input" name="threshold" type="number" min={0} max={300} defaultValue={0} /></Field>
        <button className="btn-primary w-full"><Bell className="h-4 w-4" />Criar alerta</button>
      </form>
      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-lg font-semibold">Seus alertas de promoção</h2>
        {alerts.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">Nenhum alerta criado.</p> : (
          <ul className="divide-y divide-line">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-panel2 text-muted"><Bell className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{a.program}</p><p className="text-xs text-muted">{a.threshold > 0 ? `Bônus a partir de ${a.threshold}%` : "Qualquer promoção"}</p></div>
                <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a.id)} aria-label={`Excluir alerta ${a.program}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
