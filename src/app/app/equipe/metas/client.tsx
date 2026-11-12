"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Target, Zap, X } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type Metric = "MANUAL" | "REVENUE" | "PROFIT" | "SALES" | "MILES" | "CUSTOMERS";
type KR = { id: string; title: string; metric: Metric; target: number; current: number; progress: number };
type G = { id: string; title: string; memberId: string | null; member: string | null; memberColor: string | null; keyResults: KR[]; progress: number };
type M = { id: string; name: string };
const METRICS: Record<Metric, string> = { MANUAL: "Manual (check-in)", REVENUE: "Faturamento (R$)", PROFIT: "Lucro (R$)", SALES: "Número de vendas", MILES: "Milhas vendidas", CUSTOMERS: "Clientes novos" };
const isMoney = (m: Metric) => m === "REVENUE" || m === "PROFIT";
const show = (m: Metric, v: number) => (isMoney(m) ? fmtBRL(v) : fmtPts(v));
const bar = (p: number) => (p >= 100 ? "bg-emerald-400" : p >= 60 ? "bg-accent-light" : p >= 30 ? "bg-amber-400" : "bg-red-400");

export function GoalsClient({ goals, members, period, start, canEdit = true }: { goals: G[]; members: M[]; period: string; start: string; canEdit?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<G | "new" | null>(null);
  async function checkIn(k: KR) {
    const v = window.prompt(`Check-in de "${k.title}": quanto já foi alcançado?`, String(k.current));
    if (v == null) return;
    const n = Number(v.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return toast("Valor inválido", "error");
    const r = await api(`/api/key-results/${k.id}`, "POST", { current: Math.round(n) });
    if (!r.ok) return toast(r.erro, "error");
    toast("Check-in registrado");
    refreshSafe(router);
  }
  async function remove(g: G) {
    if (!(await confirmDialog({ title: "Excluir objetivo?", body: g.title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/goals/${g.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Objetivo excluído");
    refreshSafe(router);
  }
  const avg = goals.length ? Math.round(goals.reduce((t, g) => t + g.progress, 0) / goals.length) : 0;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        {goals.length > 0 && <p className="text-sm text-muted">Progresso médio <span className="font-semibold text-white">{avg}%</span> em {goals.length} {goals.length === 1 ? "objetivo" : "objetivos"}</p>}
        <span className="flex-1" />
        {canEdit && <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Novo objetivo</button>}
      </div>
      {goals.length === 0 ? (
        <Empty title="Nenhum objetivo neste período" icon={<Target className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Crie um objetivo (ex.: &quot;Crescer as vendas de milhas&quot;) com resultados-chave como faturamento, lucro ou número de vendas: esses se atualizam sozinhos pelas suas vendas.</p>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {goals.map((g) => (
            <section key={g.id} className="card card-pad" aria-label={g.title}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold">{g.title}</h2>
                  <p className="text-xs text-muted">{g.member ? <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.memberColor ?? "#94a3b8" }} aria-hidden />{g.member}</span> : "Empresa"}</p>
                </div>
                <span className="text-lg font-semibold tabular-nums">{g.progress}%</span>
                {canEdit && <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(g)} aria-label={`Editar ${g.title}`}><Pencil className="h-4 w-4" /></button>}
                {canEdit && <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(g)} aria-label={`Excluir ${g.title}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <ul className="mt-3 space-y-3">
                {g.keyResults.map((k) => (
                  <li key={k.id} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate">{k.title}{k.metric !== "MANUAL" && <Zap className="ml-1 inline h-3 w-3 text-amber-300" aria-label="Medido pelas vendas" />}</span>
                      <span className="tabular-nums text-muted">{show(k.metric, k.current)} / {show(k.metric, k.target)}</span>
                      {k.metric === "MANUAL" && canEdit && <button className="btn-ghost h-7 px-2 text-xs" onClick={() => checkIn(k)}>Check-in</button>}
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-panel2"><div className={`h-full rounded-full ${bar(k.progress)}`} style={{ width: `${k.progress}%` }} /></div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      <p className="mt-3 flex items-center gap-1 text-xs text-muted"><Zap className="h-3 w-3 text-amber-300" />Medido sozinho pelas vendas do período. Os manuais você atualiza com o check-in.</p>
      {editing && <GoalDialog g={editing === "new" ? null : editing} members={members} period={period} start={start} onClose={() => setEditing(null)} />}
    </>
  );
}

type Row = { title: string; metric: Metric; target: string; current: string };

function GoalDialog({ g, members, period, start, onClose }: { g: G | null; members: M[]; period: string; start: string; onClose: () => void }) {
  const router = useRouter();
  const toText = (m: Metric, v: number) => (isMoney(m) ? (v / 100).toFixed(2).replace(".", ",") : String(v));
  const [title, setTitle] = useState(g?.title ?? "");
  const [memberId, setMemberId] = useState(g?.memberId ?? "");
  const [rows, setRows] = useState<Row[]>(g?.keyResults.map((k) => ({ title: k.title, metric: k.metric, target: toText(k.metric, k.target), current: k.metric === "MANUAL" ? String(k.current) : "" })) ?? [{ title: "Faturamento do período", metric: "REVENUE", target: "", current: "" }]);
  const [erro, setErro] = useState("");
  const setRow = (i: number, p: Partial<Row>) => setRows(rows.map((r, j) => (j === i ? { ...r, ...p } : r)));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const keyResults = [];
    for (const r of rows) {
      const target = isMoney(r.metric) ? parseBRLToCents(r.target) : Number(r.target.replace(/\D/g, ""));
      if (!target || target <= 0) return setErro(`Informe a meta de "${r.title || "resultado-chave"}"`);
      keyResults.push({ title: r.title, metric: r.metric, target, ...(r.metric === "MANUAL" ? { current: Number(r.current.replace(/\D/g, "")) || 0 } : {}) });
    }
    const body = { title, period, start, memberId: memberId || null, keyResults };
    const res = g ? await api(`/api/goals/${g.id}`, "PUT", body) : await api("/api/goals", "POST", body);
    if (!res.ok) return setErro(res.erro);
    toast(g ? "Objetivo atualizado" : "Objetivo criado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={g ? "Editar objetivo" : "Novo objetivo"} size="lg" icon={<Target className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="goal-form" className="btn-primary">Salvar</button></>}>
      <form id="goal-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Objetivo" required className="sm:col-span-2"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required placeholder="Ex.: Crescer as vendas de milhas" aria-label="Objetivo" autoFocus /></Field>
          <Field label="Responsável"><select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Responsável"><option value="">Empresa</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        </div>
        <div>
          <p className="label">Resultados-chave</p>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="grid items-end gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_180px_130px_auto]">
                <Field label="Resultado"><input className="input" value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} maxLength={200} aria-label={`Resultado-chave ${i + 1}`} /></Field>
                <Field label="Medida"><select className="input" value={r.metric} onChange={(e) => setRow(i, { metric: e.target.value as Metric })} aria-label={`Medida do resultado ${i + 1}`}>{Object.entries(METRICS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                <Field label={isMoney(r.metric) ? "Meta (R$)" : "Meta"}><input className="input" inputMode="decimal" value={r.target} onChange={(e) => setRow(i, { target: e.target.value })} aria-label={`Meta do resultado ${i + 1}`} /></Field>
                <button type="button" className="btn-subtle mb-0.5 h-9 w-9 px-0" onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length <= 1} aria-label={`Tirar o resultado ${i + 1}`}><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
          {rows.length < 10 && <button type="button" className="btn-ghost mt-2 h-8 text-xs" onClick={() => setRows([...rows, { title: "", metric: "MANUAL", target: "", current: "" }])}><Plus className="h-3.5 w-3.5" />Resultado-chave</button>}
        </div>
      </form>
    </Modal>
  );
}
