"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, CalendarDays, ListTodo } from "lucide-react";
import { api, today } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtDate } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type T = { id: string; title: string; description: string | null; status: string; priority: string; memberId: string | null; member: string | null; memberColor: string | null; dueDate: string | null };
type M = { id: string; name: string; color: string };
const COLUMNS = [["TODO", "A fazer", "#60a5fa"], ["DOING", "Fazendo", "#f59e0b"], ["DONE", "Feito", "#22c55e"]] as const;
const PRIO: Record<string, [string, string]> = { HIGH: ["Alta", "bg-red-500/15 text-red-300"], MEDIUM: ["Média", "bg-blue-500/15 text-blue-300"], LOW: ["Baixa", "bg-panel2 text-muted"] };

export function TasksBoard({ tasks, members, memberId }: { tasks: T[]; members: M[]; memberId: string }) {
  const router = useRouter();
  const nav = useNav();
  const [list, setList] = useState(tasks);
  const [over, setOver] = useState<string | null>(null);
  const [editing, setEditing] = useState<T | string | null>(null); // string = coluna do cartão novo
  const dragged = useRef<string | null>(null);
  useEffect(() => setList(tasks), [tasks]);
  const t0 = today();

  async function move(id: string, status: string, position?: number) {
    const prev = list;
    setList((l) => l.map((t) => (t.id === id ? { ...t, status } : t)));
    const r = await api(`/api/tasks/${id}/move`, "POST", { status, position });
    if (!r.ok) { setList(prev); return toast(r.erro, "error"); }
    refreshSafe(router);
  }
  function drop(e: React.DragEvent, status: string) {
    e.preventDefault();
    setOver(null);
    const id = dragged.current ?? e.dataTransfer.getData("text/plain");
    dragged.current = null;
    if (id) move(id, status, list.filter((t) => t.status === status && t.id !== id).length);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select className="input h-9 w-auto" value={memberId} onChange={(e) => nav(e.target.value ? `/app/equipe/tarefas?membro=${e.target.value}` : "/app/equipe/tarefas")} aria-label="Filtrar por responsável">
          <option value="">Todos os responsáveis</option>
          {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <span className="flex-1" />
        <p className="text-xs text-muted">{list.filter((t) => t.status !== "DONE").length} abertas · {list.filter((t) => t.status !== "DONE" && t.dueDate && t.dueDate < t0).length} atrasadas</p>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
        <div className="grid min-w-[720px] grid-cols-3 gap-3">
          {COLUMNS.map(([status, label, color]) => {
            const items = list.filter((t) => t.status === status);
            return (
              <section key={status} aria-label={label} onDragOver={(e) => { e.preventDefault(); setOver(status); }} onDragLeave={() => setOver((s) => (s === status ? null : s))} onDrop={(e) => drop(e, status)}
                className={`flex flex-col rounded-2xl border transition-colors ${over === status ? "border-accent-light bg-accent-soft/40" : "border-line bg-panel2/40"}`}>
                <div className="h-1 rounded-t-2xl" style={{ backgroundColor: color }} aria-hidden />
                <h2 className="flex items-center gap-2 px-3 pb-2 pt-3 text-sm font-semibold"><span className="flex-1">{label}</span><span className="rounded-full bg-panel px-2 py-0.5 text-xs text-muted">{items.length}</span></h2>
                <ul className="min-h-[120px] flex-1 space-y-2 px-2 pb-2">
                  {items.map((t) => {
                    const late = t.status !== "DONE" && t.dueDate && t.dueDate < t0;
                    return (
                      <li key={t.id} draggable onDragStart={(e) => { dragged.current = t.id; e.dataTransfer.setData("text/plain", t.id); }} className="cursor-grab rounded-xl border border-line bg-panel p-3 shadow-sm active:cursor-grabbing" aria-label={`Tarefa ${t.title}`}>
                        <button type="button" className="w-full text-left" onClick={() => setEditing(t)}>
                          <p className={`text-sm font-semibold ${t.status === "DONE" ? "text-muted line-through" : ""}`}>{t.title}</p>
                          {t.description && <p className="mt-0.5 line-clamp-2 text-xs text-muted">{t.description}</p>}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className={`rounded-full px-2 py-0.5 font-medium ${PRIO[t.priority]?.[1] ?? ""}`}>{PRIO[t.priority]?.[0]}</span>
                            {t.dueDate && <span className={`flex items-center gap-1 ${late ? "text-red-300" : "text-muted"}`}><CalendarDays className="h-3 w-3" />{fmtDate(t.dueDate)}</span>}
                            {t.member && <span className="ml-auto flex items-center gap-1 text-muted"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.memberColor ?? "#94a3b8" }} aria-hidden />{t.member}</span>}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                  {items.length === 0 && <li className="flex h-20 items-center justify-center rounded-xl border border-dashed border-line text-xs text-muted">Arraste tarefas para cá</li>}
                </ul>
                <button type="button" className="mx-2 mb-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-sm text-muted hover:border-zinc-500 hover:text-zinc-100" onClick={() => setEditing(status)}><Plus className="h-4 w-4" />Adicionar tarefa</button>
              </section>
            );
          })}
        </div>
      </div>
      {editing && <TaskDialog t={typeof editing === "string" ? null : editing} status={typeof editing === "string" ? editing : editing.status} members={members} onClose={() => setEditing(null)} />}
    </>
  );
}

function TaskDialog({ t, status, members, onClose }: { t: T | null; status: string; members: M[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ title: t?.title ?? "", description: t?.description ?? "", priority: t?.priority ?? "MEDIUM", memberId: t?.memberId ?? "", dueDate: t?.dueDate ?? "" });
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, description: f.description || null, memberId: f.memberId || null, dueDate: f.dueDate || null, ...(t ? {} : { status }) };
    const r = t ? await api(`/api/tasks/${t.id}`, "PUT", body) : await api("/api/tasks", "POST", body);
    if (!r.ok) return setErro(r.erro);
    toast(t ? "Tarefa atualizada" : "Tarefa criada");
    onClose();
    refreshSafe(router);
  }
  async function remove() {
    if (!t || !(await confirmDialog({ title: "Excluir tarefa?", body: t.title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/tasks/${t.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Tarefa excluída");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={t ? "Editar tarefa" : "Nova tarefa"} icon={<ListTodo className="h-5 w-5" />}
      footer={<>{t && <button type="button" className="btn-ghost mr-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}<button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="task-form" className="btn-primary">Salvar</button></>}>
      <form id="task-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
        {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
        <Field label="Tarefa" required className="sm:col-span-2"><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={200} required aria-label="Tarefa" autoFocus /></Field>
        <Field label="Detalhes" className="sm:col-span-2"><textarea className="input min-h-20" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={2000} aria-label="Detalhes" /></Field>
        <Field label="Responsável"><select className="input" value={f.memberId} onChange={(e) => setF({ ...f, memberId: e.target.value })} aria-label="Responsável"><option value="">Ninguém (você)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Prazo"><input className="input" type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} aria-label="Prazo" /></Field>
        <Field label="Prioridade"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} aria-label="Prioridade">{Object.entries(PRIO).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </form>
    </Modal>
  );
}
