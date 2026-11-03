"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Workflow, Play, X, ChevronUp, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type Step = { title: string; detail?: string | null };
type P = { id: string; title: string; description: string | null; steps: Step[] };
type M = { id: string; name: string };

/** Modelos para começar rápido (o usuário edita como quiser). */
const TEMPLATES: { title: string; description: string; steps: string[] }[] = [
  { title: "Emissão de passagem com milhas", description: "Do pedido do cliente até a reserva confirmada", steps: ["Confirmar trecho, datas e passageiros com o cliente", "Buscar a melhor opção no Buscador", "Enviar a cotação e receber o aceite", "Receber o pagamento", "Escolher a conta (Sugerir Conta) e emitir", "Registrar a venda", "Enviar o localizador e a página da reserva ao cliente"] },
  { title: "Reembolso de venda", description: "Quando o cliente desiste em até 24 horas", steps: ["Conferir o prazo de reembolso na venda", "Cancelar a emissão no site da companhia", "Marcar a venda como reembolsada (taxa de administração)", "Acompanhar o estorno das milhas e da taxa", "Devolver ao cliente o valor menos a taxa"] },
];

export function ProcessesClient({ processes, members }: { processes: P[]; members: M[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<P | { title: string; description: string; steps: Step[] } | null>(null);
  const [running, setRunning] = useState<P | null>(null);
  async function remove(p: P) {
    if (!(await confirmDialog({ title: "Excluir processo?", body: p.title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/processes/${p.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Processo excluído");
    refreshSafe(router);
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex-1" />
        {TEMPLATES.filter((t) => !processes.some((p) => p.title === t.title)).map((t) => (
          <button key={t.title} className="btn-ghost" onClick={() => setEditing({ title: t.title, description: t.description, steps: t.steps.map((s) => ({ title: s })) })}><Plus className="h-4 w-4" />Modelo: {t.title}</button>
        ))}
        <button className="btn-primary" onClick={() => setEditing({ title: "", description: "", steps: [{ title: "" }] })}><Plus className="h-4 w-4" />Novo processo</button>
      </div>
      {processes.length === 0 ? (
        <Empty title="Nenhum processo" icon={<Workflow className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Escreva o passo a passo de como a sua operação faz cada coisa. Quando for executar, clique em Usar e cada etapa vira uma tarefa no quadro.</p>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {processes.map((p) => (
            <section key={p.id} className="card card-pad" aria-label={p.title}>
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1"><h2 className="font-semibold">{p.title}</h2>{p.description && <p className="text-sm text-muted">{p.description}</p>}</div>
                <button className="btn-primary h-8" onClick={() => setRunning(p)}><Play className="h-3.5 w-3.5" />Usar</button>
                <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(p)} aria-label={`Editar ${p.title}`}><Pencil className="h-4 w-4" /></button>
                <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(p)} aria-label={`Excluir ${p.title}`}><Trash2 className="h-4 w-4" /></button>
              </div>
              <ol className="mt-3 space-y-1.5">
                {p.steps.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm"><span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-panel2 text-[11px] font-semibold text-muted">{i + 1}</span><span>{s.title}{s.detail && <span className="block text-xs text-muted">{s.detail}</span>}</span></li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
      {editing && <ProcessDialog p={editing} onClose={() => setEditing(null)} />}
      {running && <RunDialog p={running} members={members} onClose={() => setRunning(null)} />}
    </>
  );
}

function ProcessDialog({ p, onClose }: { p: P | { title: string; description: string; steps: Step[] }; onClose: () => void }) {
  const router = useRouter();
  const id = "id" in p ? p.id : null;
  const [title, setTitle] = useState(p.title);
  const [description, setDescription] = useState(p.description ?? "");
  const [steps, setSteps] = useState<Step[]>(p.steps.length ? p.steps : [{ title: "" }]);
  const [erro, setErro] = useState("");
  const setStep = (i: number, patch: Partial<Step>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const swap = (i: number, j: number) => { const n = [...steps]; [n[i], n[j]] = [n[j]!, n[i]!]; setSteps(n); };
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { title, description: description || null, steps: steps.filter((s) => s.title.trim()).map((s) => ({ title: s.title, detail: s.detail || null })) };
    if (!body.steps.length) return setErro("Inclua ao menos uma etapa");
    const r = id ? await api(`/api/processes/${id}`, "PUT", body) : await api("/api/processes", "POST", body);
    if (!r.ok) return setErro(r.erro);
    toast(id ? "Processo atualizado" : "Processo criado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={id ? "Editar processo" : "Novo processo"} size="lg" icon={<Workflow className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="proc-form" className="btn-primary">Salvar</button></>}>
      <form id="proc-form" onSubmit={save} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome do processo" required><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required aria-label="Nome do processo" /></Field>
        <Field label="Para que serve"><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} aria-label="Para que serve" /></Field>
        <p className="label">Etapas</p>
        <ol className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel2 text-xs font-semibold text-muted">{i + 1}</span>
              <div className="grid flex-1 gap-1">
                <input className="input" value={s.title} onChange={(e) => setStep(i, { title: e.target.value })} maxLength={200} placeholder="O que fazer" aria-label={`Etapa ${i + 1}`} />
                <input className="input h-8 text-xs" value={s.detail ?? ""} onChange={(e) => setStep(i, { detail: e.target.value })} maxLength={1000} placeholder="Detalhe (opcional)" aria-label={`Detalhe da etapa ${i + 1}`} />
              </div>
              <div className="flex flex-col">
                <button type="button" className="btn-subtle h-6 w-7 px-0" disabled={i === 0} onClick={() => swap(i, i - 1)} aria-label={`Subir etapa ${i + 1}`}><ChevronUp className="h-3.5 w-3.5" /></button>
                <button type="button" className="btn-subtle h-6 w-7 px-0" disabled={i === steps.length - 1} onClick={() => swap(i, i + 1)} aria-label={`Descer etapa ${i + 1}`}><ChevronDown className="h-3.5 w-3.5" /></button>
              </div>
              <button type="button" className="btn-subtle mt-1 h-8 w-8 px-0" disabled={steps.length <= 1} onClick={() => setSteps(steps.filter((_, j) => j !== i))} aria-label={`Tirar etapa ${i + 1}`}><X className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>
        {steps.length < 50 && <button type="button" className="btn-ghost h-8 text-xs" onClick={() => setSteps([...steps, { title: "" }])}><Plus className="h-3.5 w-3.5" />Etapa</button>}
      </form>
    </Modal>
  );
}

function RunDialog({ p, members, onClose }: { p: P; members: M[]; onClose: () => void }) {
  const nav = useNav();
  const [label, setLabel] = useState("");
  const [memberId, setMemberId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [erro, setErro] = useState("");
  async function run(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ created: number }>(`/api/processes/${p.id}/run`, "POST", { label: label || null, memberId: memberId || null, dueDate: dueDate || null });
    if (!r.ok) return setErro(r.erro);
    toast(`${r.data.created} tarefas criadas`);
    onClose();
    nav("/app/equipe/tarefas");
  }
  return (
    <Modal open onClose={onClose} title={`Usar: ${p.title}`} size="sm" icon={<Play className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="run-form" className="btn-primary">Criar {p.steps.length} tarefas</button></>}>
      <form id="run-form" onSubmit={run} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Cada etapa vira uma tarefa em &quot;A fazer&quot;.</p>
        <Field label="Para quê" hint="Vai no começo de cada tarefa"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Ex.: Pedido #12 Maria" aria-label="Para quê" /></Field>
        <Field label="Responsável"><select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Responsável"><option value="">Ninguém (você)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Prazo"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Prazo" /></Field>
      </form>
    </Modal>
  );
}
