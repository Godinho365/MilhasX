"use client";
// Tarefas em quadros: colunas por pessoa (como no Volly) ou por situação; tarefa com checklist, anexos, comentários e recorrência.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Users, ArrowUpDown, LayoutGrid, Trash2, Pencil, CalendarDays, CheckSquare, Paperclip, MessageSquare, Circle, CheckCircle2, X, Upload, Download, Repeat, Lock, Globe, ChevronUp, ChevronDown } from "lucide-react";
import { api, today } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { RECURRENCES, BASIC_COLUMNS, columnOf, type Recurrence } from "@/domain/team";
import type { TaskView, BoardView as Board } from "@/server/services/team";

type M = { id: string; name: string; color: string; role: string | null };
type Sort = "manual" | "prazo" | "prioridade";

const PRIO: Record<string, [string, string, string]> = {
  URGENT: ["Urgente", "bg-red-500/20 text-red-300", "#ef4444"],
  HIGH: ["Alta", "bg-orange-500/15 text-orange-300", "#fb923c"],
  MEDIUM: ["Média", "bg-amber-500/15 text-amber-300", "#f59e0b"],
  LOW: ["Baixa", "bg-panel2 text-muted", "#94a3b8"],
};
const STATUS = [["TODO", "Pendente", "#60a5fa"], ["DOING", "Em progresso", "#f59e0b"], ["DONE", "Concluída", "#22c55e"]] as const;
const COL_COLORS = ["#60a5fa", "#f59e0b", "#a78bfa", "#f472b6", "#2dd4bf", "#fb923c"];
const colColor = (i: number, n: number) => (n > 1 && i === n - 1 ? "#22c55e" : COL_COLORS[i % COL_COLORS.length]!);
const RANK: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
const OWNER = "__dono__"; // coluna do dono da conta (tarefas sem membro)

function Avatar({ name, color, size = 6 }: { name: string; color?: string; size?: number }) {
  return <span className="flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-zinc-950" style={{ backgroundColor: color ?? "#94a3b8", width: size * 4, height: size * 4 }} title={name}>{initials(name)}</span>;
}

export function TasksBoard({ boards, board, tasks, members, owner }: { boards: Board[]; board: Board; tasks: TaskView[]; members: M[]; owner: string }) {
  const router = useRouter();
  const nav = useNav();
  const [list, setList] = useState(tasks);
  const [q, setQ] = useState("");
  const [onlyMember, setOnlyMember] = useState("");
  const [sort, setSort] = useState<Sort>("manual");
  const [view, setView] = useState<"pessoa" | "situacao">("pessoa");
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<TaskView | { lane: string } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [boardForm, setBoardForm] = useState<Board | "new" | null>(null);
  const dragged = useRef<string | null>(null);
  useEffect(() => setList(tasks), [tasks]);
  useEffect(() => {
    try { setView(localStorage.getItem("mm:tasks-view") === "situacao" ? "situacao" : "pessoa"); } catch {}
  }, []);
  const pickView = (v: "pessoa" | "situacao") => { setView(v); try { localStorage.setItem("mm:tasks-view", v); } catch {} };
  const t0 = today();

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    let r = list.filter((t) => (!term || t.title.toLowerCase().includes(term) || (t.description ?? "").toLowerCase().includes(term)) && (!onlyMember || (onlyMember === OWNER ? t.memberIds.length === 0 : t.memberIds.includes(onlyMember))) && (!hideDone || t.status !== "DONE"));
    if (sort === "prazo") r = [...r].sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") || (a.dueTime ?? "").localeCompare(b.dueTime ?? ""));
    if (sort === "prioridade") r = [...r].sort((a, b) => RANK[a.priority]! - RANK[b.priority]!);
    return r;
  }, [list, q, onlyMember, sort, hideDone]);

  const lanes: { key: string; title: string; sub: string; color?: string; items: TaskView[] }[] = view === "pessoa"
    ? [
        { key: OWNER, title: owner, sub: "Dono da conta", items: shown.filter((t) => t.memberIds.length === 0) },
        ...members.map((m) => ({ key: m.id, title: m.name, sub: m.role || "Membro", color: m.color, items: shown.filter((t) => t.memberIds.includes(m.id)) })),
      ]
    : board.columns.map((c, i) => ({ key: c.id, title: c.name, sub: "", color: colColor(i, board.columns.length), items: shown.filter((t) => columnOf(board.columns, t) === c.id) }));

  async function setStatus(t: TaskView, status: string) {
    setList((l) => l.map((x) => (x.id === t.id ? { ...x, status, columnId: null } : x)));
    const r = await api(`/api/tasks/${t.id}/move`, "POST", { status });
    if (!r.ok) return toast(r.erro, "error");
    if (status === "DONE" && t.recurrence !== "NONE") toast("Concluída: a próxima ocorrência foi criada");
    refreshSafe(router);
  }
  async function drop(e: React.DragEvent, lane: string) {
    e.preventDefault();
    setOver(null);
    const id = dragged.current ?? e.dataTransfer.getData("text/plain");
    dragged.current = null;
    const t = list.find((x) => x.id === id);
    if (!t) return;
    if (view === "situacao") {
      if (columnOf(board.columns, t) === lane) return;
      setList((l) => l.map((x) => (x.id === id ? { ...x, columnId: lane } : x)));
      const r = await api(`/api/tasks/${id}/move`, "POST", { columnId: lane });
      if (!r.ok) return toast(r.erro, "error");
      return refreshSafe(router);
    }
    const memberId = lane === OWNER ? null : lane;
    if ((memberId === null && t.memberIds.length === 0) || (memberId && t.memberIds.length === 1 && t.memberIds[0] === memberId)) return;
    const r = await api(`/api/tasks/${id}/assign`, "POST", { memberId });
    if (!r.ok) return toast(r.erro, "error");
    toast(`Tarefa passada para ${memberId ? members.find((m) => m.id === memberId)?.name : owner}`);
    refreshSafe(router);
  }
  async function deleteBoard() {
    if (!(await confirmDialog({ title: `Excluir o quadro "${board.name}"?`, body: "As tarefas dele também saem.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/task-boards/${board.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    nav("/app/equipe/tarefas");
    refreshSafe(router);
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{board.name} <span className="text-sm font-normal text-muted">({list.length} {list.length === 1 ? "tarefa" : "tarefas"})</span></h1>
        <span className="flex-1" />
        <label className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tarefas..." aria-label="Buscar tarefas" />
        </label>
        <label className="relative">
          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <select className="input h-9 w-auto pl-9" value={onlyMember} onChange={(e) => setOnlyMember(e.target.value)} aria-label="Membros">
            <option value="">Todos os membros</option>
            <option value={OWNER}>{owner}</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </label>
        <label className="relative">
          <ArrowUpDown className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <select className="input h-9 w-auto pl-9" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar tarefas">
            <option value="manual">Manual (arrastar)</option>
            <option value="prazo">Por prazo</option>
            <option value="prioridade">Por prioridade</option>
          </select>
        </label>
        <button className="btn-primary h-9" onClick={() => setEditing({ lane: view === "pessoa" ? OWNER : board.columns[0]?.id ?? "" })}><Plus className="h-4 w-4" />Nova tarefa</button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-1 border-b border-line">
        {boards.map((b) => (
          <button key={b.id} type="button" onClick={() => nav(`/app/equipe/tarefas?quadro=${b.id}`)} aria-current={b.id === board.id ? "page" : undefined} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium ${b.id === board.id ? "border-accent-light text-white" : "border-transparent text-muted hover:text-zinc-100"}`}>
            {b.restricted ? <Lock className="h-4 w-4" aria-label="Quadro restrito" /> : <LayoutGrid className="h-4 w-4" />}{b.name}
          </button>
        ))}
        <button type="button" onClick={() => setBoardForm("new")} className="flex items-center gap-1.5 px-3 py-2 text-sm text-muted hover:text-zinc-100"><Plus className="h-4 w-4" />Novo quadro</button>
        <span className="flex-1" />
        <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setBoardForm(board)} aria-label="Editar quadro" title="Editar quadro"><Pencil className="h-3.5 w-3.5" /></button>
        {boards.length > 1 && <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={deleteBoard} aria-label="Excluir quadro"><Trash2 className="h-3.5 w-3.5" /></button>}
        <div className="ml-2 inline-flex gap-1 rounded-lg border border-line bg-panel p-0.5" role="group" aria-label="Colunas">
          <button type="button" aria-pressed={view === "pessoa"} onClick={() => pickView("pessoa")} className={`rounded-md px-2 py-1 text-xs font-medium ${view === "pessoa" ? "bg-panel2 text-white" : "text-muted"}`}>Por pessoa</button>
          <button type="button" aria-pressed={view === "situacao"} onClick={() => pickView("situacao")} className={`rounded-md px-2 py-1 text-xs font-medium ${view === "situacao" ? "bg-panel2 text-white" : "text-muted"}`}>Por situação</button>
        </div>
        <label className="ml-2 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />Esconder concluídas</label>
      </div>

      {board.description && <p className="-mt-2 mb-3 text-sm text-muted">{board.description}</p>}
      {view === "situacao" && board.columns.length === 0 && (
        <div className="card card-pad mb-3 text-center text-sm text-muted">
          Este quadro ainda não tem colunas. <button type="button" className="font-medium text-accent-light hover:underline" onClick={() => setBoardForm(board)}>Adicionar colunas</button> ou use a visão Por pessoa.
        </div>
      )}
      <div className="-mx-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
        <div className="flex min-w-max gap-3">
          {lanes.map((lane) => (
            <section key={lane.key} aria-label={lane.title} onDragOver={(e) => { e.preventDefault(); setOver(lane.key); }} onDragLeave={() => setOver((s) => (s === lane.key ? null : s))} onDrop={(e) => drop(e, lane.key)}
              className={`flex w-[290px] shrink-0 flex-col rounded-2xl border transition-colors ${over === lane.key ? "border-accent-light bg-accent-soft/40" : "border-line bg-panel2/40"}`}>
              <div className="flex items-center gap-2.5 border-b border-line px-3 py-2.5">
                {view === "pessoa" ? <Avatar name={lane.title} color={lane.color ?? "#a78bfa"} size={8} /> : <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: lane.color }} aria-hidden />}
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{lane.title}</p>{lane.sub && <p className="truncate text-xs text-muted">{lane.sub}</p>}</div>
                <span className="rounded-full bg-panel px-2 py-0.5 text-xs tabular-nums text-muted">{lane.items.length}</span>
              </div>
              <ul className="max-h-[calc(100vh-300px)] min-h-[160px] flex-1 space-y-2 overflow-y-auto p-2">
                {lane.items.map((t) => {
                  const late = t.status !== "DONE" && !!t.dueDate && t.dueDate < t0;
                  const done = t.status === "DONE";
                  return (
                    <li key={t.id} draggable onDragStart={(e) => { dragged.current = t.id; e.dataTransfer.setData("text/plain", t.id); }} className="group cursor-grab overflow-hidden rounded-xl border border-line bg-panel shadow-sm active:cursor-grabbing" aria-label={`Tarefa ${t.title}`}>
                      <div className="h-1" style={{ backgroundColor: PRIO[t.priority]?.[2] }} aria-hidden />
                      <div className="flex gap-2 p-3">
                        <button type="button" onClick={() => setStatus(t, done ? "TODO" : "DONE")} className={`mt-0.5 shrink-0 ${done ? "text-emerald-400" : "text-muted hover:text-emerald-300"}`} aria-label={done ? `Reabrir ${t.title}` : `Concluir ${t.title}`} title={done ? "Reabrir" : "Concluir"}>
                          {done ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                        </button>
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(t)}>
                          <p className={`text-sm font-medium ${done ? "text-muted line-through" : ""}`}>{t.title}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                            <span className={`rounded-full px-2 py-0.5 font-medium ${PRIO[t.priority]?.[1]}`}>{PRIO[t.priority]?.[0]}</span>
                            {view === "pessoa" && t.status === "DOING" && <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-blue-300">Em progresso</span>}
                            {t.checklist.length > 0 && <span className="flex items-center gap-0.5"><CheckSquare className="h-3 w-3" />{t.checklistDone}/{t.checklist.length}</span>}
                            {t.dueDate && <span className={`flex items-center gap-0.5 ${late ? "text-red-300" : ""}`}><CalendarDays className="h-3 w-3" />{fmtDate(t.dueDate).slice(0, 5)}{t.dueTime && ` ${t.dueTime}`}</span>}
                            {t.recurrence !== "NONE" && <Repeat className="h-3 w-3" aria-label={RECURRENCES[t.recurrence]} />}
                            {t.comments > 0 && <span className="flex items-center gap-0.5"><MessageSquare className="h-3 w-3" />{t.comments}</span>}
                            {t.attachments > 0 && <span className="flex items-center gap-0.5"><Paperclip className="h-3 w-3" />{t.attachments}</span>}
                            {view === "situacao" && <span className="ml-auto flex -space-x-1">{t.members.length ? t.members.map((m) => <Avatar key={m.id} name={m.name} color={m.color} size={5} />) : <Avatar name={owner} color="#a78bfa" size={5} />}</span>}
                          </div>
                        </button>
                      </div>
                    </li>
                  );
                })}
                {lane.items.length === 0 && <li className="py-8 text-center text-xs text-muted">Nenhuma tarefa</li>}
              </ul>
              <button type="button" className="flex items-center gap-1.5 border-t border-line px-3 py-2.5 text-sm text-muted hover:text-zinc-100" onClick={() => setEditing({ lane: lane.key })}><Plus className="h-4 w-4" />Adicionar tarefa</button>
            </section>
          ))}
        </div>
      </div>
      {boardForm && <BoardDialog board={boardForm === "new" ? null : boardForm} members={members} owner={owner} onClose={() => setBoardForm(null)} onSaved={(id) => { setBoardForm(null); nav(`/app/equipe/tarefas?quadro=${id}`); refreshSafe(router); }} />}
      {editing && <TaskDialog key={"id" in editing ? editing.id : `new-${editing.lane}`} task={"id" in editing ? editing : null} lane={"lane" in editing ? editing.lane : null} view={view} boards={boards} board={board} members={members} owner={owner} onClose={() => setEditing(null)} />}
    </>
  );
}

type Detail = { comments: { id: string; kind: string; text: string; createdAt: string }[]; files: { id: string; name: string; size: number }[] };

function TaskDialog({ task, lane, view, boards, board, members, owner, onClose }: { task: TaskView | null; lane: string | null; view: string; boards: Board[]; board: Board; members: M[]; owner: string; onClose: () => void }) {
  const router = useRouter();
  const initialMembers = task ? task.memberIds : view === "pessoa" && lane && lane !== OWNER ? [lane] : [];
  const [f, setF] = useState({
    title: task?.title ?? "", boardId: task?.boardId ?? board.id, dueDate: task?.dueDate ?? "", dueTime: task?.dueTime ?? "",
    priority: task?.priority ?? "MEDIUM", memberIds: initialMembers, description: task?.description ?? "",
    status: task?.status ?? "TODO", columnId: task ? columnOf(board.columns, task) : view === "situacao" && lane ? lane : board.columns[0]?.id ?? null, recurrence: (task?.recurrence ?? "NONE") as Recurrence,
    checklist: task?.checklist ?? [],
  });
  const [item, setItem] = useState("");
  const [comment, setComment] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const cols = boards.find((b) => b.id === f.boardId)?.columns ?? [];
  const load = async () => { if (task) { const r = await api<Detail>(`/api/tasks/${task.id}`); if (r.ok) setDetail(r.data); } };
  useEffect(() => { load(); }, [task?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!f.title.trim()) return setErro("Informe o título da tarefa");
    setBusy(true);
    const checklist = item.trim() ? [...f.checklist, { text: item.trim(), done: false }] : f.checklist;
    const body = { ...f, checklist, description: f.description || null, dueDate: f.dueDate || null, dueTime: f.dueTime || null, columnId: cols.length ? f.columnId : null };
    const r = task ? await api(`/api/tasks/${task.id}`, "PUT", body) : await api("/api/tasks", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(task ? "Tarefa salva" : "Tarefa criada");
    onClose();
    refreshSafe(router);
  }
  async function remove() {
    if (!task || !(await confirmDialog({ title: "Excluir tarefa?", body: task.title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/tasks/${task.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Tarefa excluída");
    onClose();
    refreshSafe(router);
  }
  async function sendComment() {
    if (!task || !comment.trim()) return;
    const r = await api(`/api/tasks/${task.id}/comments`, "POST", { text: comment });
    if (!r.ok) return toast(r.erro, "error");
    setComment("");
    load();
    refreshSafe(router);
  }
  async function upload(file: File) {
    if (!task) return;
    const res = await fetch(`/api/tasks/${task.id}/files`, { method: "POST", headers: { "x-file-name": encodeURIComponent(file.name) }, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast(data.erro ?? "Não deu para enviar o arquivo", "error");
    toast("Anexo enviado");
    load();
    refreshSafe(router);
  }
  async function removeFile(id: string) {
    if (!task) return;
    const r = await api(`/api/tasks/${task.id}/files/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    load();
    refreshSafe(router);
  }
  const memberLabel = f.memberIds.length === 0 ? owner : f.memberIds.length === 1 ? members.find((m) => m.id === f.memberIds[0])?.name ?? "1 selecionado" : `${f.memberIds.length} selecionados`;

  return (
    <Modal open onClose={onClose} title={task ? "Editar tarefa" : "Nova tarefa"} size="lg"
      footer={<>{task && <button type="button" className="btn-ghost mr-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}<button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" onClick={() => save()} disabled={busy}>{task ? "Salvar" : "Criar tarefa"}</button></>}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <form onSubmit={save} className="space-y-4">
          <p className="text-xs text-muted">Criado por {owner}{task ? ` · em ${fmtDate(task.createdAt)}` : ""}</p>
          {erro && <Alert>{erro}</Alert>}
          <input className="input text-base font-semibold" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={200} placeholder="Título da tarefa..." aria-label="Título da tarefa" autoFocus />
          <Field label="Quadro"><select className="input" value={f.boardId} onChange={(e) => set({ boardId: e.target.value, columnId: columnOf(boards.find((b) => b.id === e.target.value)?.columns ?? [], { status: f.status }) })} aria-label="Quadro">{boards.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Data limite"><input className="input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} aria-label="Data limite" /></Field>
            <Field label="Horário"><input className="input" type="time" value={f.dueTime} onChange={(e) => set({ dueTime: e.target.value })} disabled={!f.dueDate} aria-label="Horário" /></Field>
            <Field label="Prioridade"><select className="input" value={f.priority} onChange={(e) => set({ priority: e.target.value })} aria-label="Prioridade">{Object.entries(PRIO).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            <Field label="Membros">
              <div className="relative">
                <button type="button" className="input flex items-center gap-1.5 text-left" onClick={() => setMembersOpen((o) => !o)} aria-expanded={membersOpen} aria-label="Membros"><Users className="h-4 w-4 shrink-0 text-muted" /><span className="truncate">{memberLabel}</span></button>
                {membersOpen && (
                  <div className="absolute right-0 z-50 mt-1 w-56 rounded-xl border border-line bg-panel2 p-1 shadow-xl">
                    {members.length === 0 && <p className="px-2 py-2 text-xs text-muted">Cadastre membros em Equipe.</p>}
                    {members.map((m) => (
                      <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-line">
                        <input type="checkbox" checked={f.memberIds.includes(m.id)} onChange={(e) => set({ memberIds: e.target.checked ? [...f.memberIds, m.id] : f.memberIds.filter((x) => x !== m.id) })} />
                        <Avatar name={m.name} color={m.color} size={5} />{m.name}
                      </label>
                    ))}
                    <p className="px-2 py-1 text-[11px] text-muted">Sem ninguém marcado, fica com {owner}.</p>
                  </div>
                )}
              </div>
            </Field>
          </div>
          <Field label="Descrição"><textarea className="input min-h-24" value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={5000} placeholder="Adicione uma descrição..." aria-label="Descrição" /></Field>
          <div>
            <p className="label flex items-center gap-1.5"><CheckSquare className="h-4 w-4" />Checklist {f.checklist.length > 0 && <span className="text-muted">{f.checklist.filter((i) => i.done).length}/{f.checklist.length}</span>}</p>
            <ul className="mb-2 space-y-1">
              {f.checklist.map((i, idx) => (
                <li key={idx} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={i.done} onChange={(e) => set({ checklist: f.checklist.map((x, j) => (j === idx ? { ...x, done: e.target.checked } : x)) })} aria-label={`Feito: ${i.text}`} />
                  <span className={`flex-1 ${i.done ? "text-muted line-through" : ""}`}>{i.text}</span>
                  <button type="button" className="btn-subtle h-6 w-6 px-0" onClick={() => set({ checklist: f.checklist.filter((_, j) => j !== idx) })} aria-label={`Tirar ${i.text}`}><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input className="input" value={item} onChange={(e) => setItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (item.trim()) { set({ checklist: [...f.checklist, { text: item.trim(), done: false }] }); setItem(""); } } }} maxLength={200} placeholder="Adicionar item..." aria-label="Adicionar item ao checklist" />
              <button type="button" className="btn-ghost" onClick={() => { if (item.trim()) { set({ checklist: [...f.checklist, { text: item.trim(), done: false }] }); setItem(""); } }} aria-label="Adicionar item"><Plus className="h-4 w-4" /></button>
            </div>
          </div>
          <div>
            <div className="mb-2 flex items-center gap-2"><p className="label mb-0 flex flex-1 items-center gap-1.5"><Paperclip className="h-4 w-4" />Anexos <span className="text-muted">{detail?.files.length ?? 0}</span></p>
              {task && <button type="button" className="btn-ghost h-8" onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />Adicionar</button>}
              <input ref={fileRef} type="file" className="hidden" accept="image/*,application/pdf" onChange={(e) => { const file = e.target.files?.[0]; if (file) upload(file); e.target.value = ""; }} />
            </div>
            {!task ? <p className="rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-muted">Os anexos ficam disponíveis depois de criar a tarefa.</p>
              : detail?.files.length ? (
                <ul className="space-y-1">{detail.files.map((x) => <li key={x.id} className="flex items-center gap-2 rounded-lg bg-panel2/60 px-3 py-1.5 text-sm"><span className="flex-1 truncate">{x.name}</span><span className="text-xs text-muted">{Math.ceil(x.size / 1024)} KB</span><a href={`/api/tasks/${task.id}/files/${x.id}`} className="btn-subtle h-7 w-7 px-0" aria-label={`Baixar ${x.name}`}><Download className="h-3.5 w-3.5" /></a><button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => removeFile(x.id)} aria-label={`Excluir ${x.name}`}><Trash2 className="h-3.5 w-3.5" /></button></li>)}</ul>
              ) : <button type="button" className="w-full rounded-xl border border-dashed border-line px-4 py-3 text-center text-xs text-muted hover:text-zinc-100" onClick={() => fileRef.current?.click()}>Nenhum anexo. Clique aqui para enviar (imagem ou PDF, até 10 MB).</button>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Situação">{cols.length
              ? <select className="input" value={f.columnId ?? ""} onChange={(e) => set({ columnId: e.target.value })} aria-label="Situação">{cols.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              : <select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })} aria-label="Situação">{STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}</Field>
            <Field label="Recorrência" hint={f.recurrence !== "NONE" ? "Ao concluir, a próxima é criada sozinha" : undefined}><select className="input" value={f.recurrence} onChange={(e) => set({ recurrence: e.target.value as Recurrence })} aria-label="Recorrência">{Object.entries(RECURRENCES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          </div>
        </form>
        <aside className="flex min-h-[260px] flex-col rounded-xl border border-line bg-panel2/40 p-3" aria-label="Comentários e atividade">
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><MessageSquare className="h-4 w-4" />Comentários e atividade</p>
          {!task ? <p className="m-auto text-center text-xs text-muted">Comentários disponíveis depois de criar a tarefa</p> : (
            <>
              <div className="flex gap-2">
                <input className="input h-9" value={comment} onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendComment(); } }} maxLength={2000} placeholder="Escreva um comentário..." aria-label="Comentário" />
                <button type="button" className="btn-primary h-9" onClick={sendComment} disabled={!comment.trim()}>Enviar</button>
              </div>
              <ul className="mt-3 flex-1 space-y-2 overflow-y-auto text-sm">
                {(detail?.comments ?? []).map((c) => (
                  <li key={c.id} className={c.kind === "ACTIVITY" ? "text-xs text-muted" : "rounded-lg bg-panel px-3 py-2"}>
                    {c.kind === "COMMENT" && <p className="mb-0.5 flex items-center gap-1.5 text-xs text-muted"><Avatar name={owner} color="#a78bfa" size={4} />{owner}</p>}
                    <p className="whitespace-pre-wrap">{c.text}</p>
                    <p className="text-[10px] text-muted">{fmtDateTime(c.createdAt)}</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>
      </div>
    </Modal>
  );
}

type ColumnModel = "basico" | "custom" | "vazio";

/** Novo quadro / editar quadro: nome, descrição, colunas (básico, customizado ou em branco) e quem acessa. */
function BoardDialog({ board, members, owner, onClose, onSaved }: { board: Board | null; members: M[]; owner: string; onClose: () => void; onSaved: (id: string) => void }) {
  const [name, setName] = useState(board?.name ?? "");
  const [description, setDescription] = useState(board?.description ?? "");
  const [model, setModel] = useState<ColumnModel>(board ? "custom" : "basico");
  const [cols, setCols] = useState<{ id?: string; name: string }[]>(board ? board.columns : BASIC_COLUMNS.map((c) => ({ name: c.name })));
  const [restricted, setRestricted] = useState(board?.restricted ?? false);
  const [memberIds, setMemberIds] = useState<string[]>(board?.memberIds ?? []);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);

  function pickModel(m: ColumnModel) {
    setModel(m);
    if (m === "basico") setCols(BASIC_COLUMNS.map((c) => ({ name: c.name })));
    if (m === "custom" && !cols.length) setCols([{ name: "" }]);
  }
  const editCol = (i: number, name: string) => setCols(cols.map((c, j) => (j === i ? { ...c, name } : c)));
  const moveCol = (i: number, d: number) => { const n = [...cols]; [n[i], n[i + d]] = [n[i + d]!, n[i]!]; setCols(n); };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErro("Dê um nome ao quadro");
    const columns = model === "vazio" ? [] : cols.map((c) => ({ ...c, name: c.name.trim() })).filter((c) => c.name);
    if (model === "custom" && !columns.length) return setErro("Adicione ao menos uma coluna, ou escolha Em branco");
    if (restricted && !memberIds.length && members.length) return setErro("Escolha quem pode ver o quadro restrito");
    setBusy(true);
    const body = { name, description: description.trim() || null, columns, restricted, memberIds };
    const r = board ? await api(`/api/task-boards/${board.id}`, "PUT", body) : await api<{ id: string }>("/api/task-boards", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(board ? "Quadro salvo" : "Quadro criado");
    onSaved(board ? board.id : (r.data as { id: string }).id);
  }

  const option = (active: boolean) => `flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left ${active ? "border-accent-light bg-accent-soft/40" : "border-line hover:bg-panel2/60"}`;
  const dot = (active: boolean) => <span className={`mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${active ? "border-accent-light bg-accent-light" : "border-line"}`} aria-hidden />;

  return (
    <Modal open onClose={onClose} title={board ? "Editar quadro" : "Novo quadro"} icon={<LayoutGrid className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" form="board-form" className="btn-primary" disabled={busy}>{board ? "Salvar" : "Criar quadro"}</button></>}>
      <form id="board-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome do quadro"><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Ex.: Emissões, Financeiro..." autoFocus /></Field>
        <Field label="Descrição (opcional)"><textarea className="input min-h-[64px]" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} placeholder="Para que serve este quadro" /></Field>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Modelo de colunas</legend>
          {board && <p className="text-xs text-muted">Tarefas de uma coluna removida voltam para a coluna da situação delas.</p>}
          <button type="button" role="radio" aria-checked={model === "basico"} className={option(model === "basico")} onClick={() => pickModel("basico")}>{dot(model === "basico")}<span><span className="block text-sm font-medium">Básico</span><span className="block text-xs text-muted">A fazer · Em andamento · Concluído</span></span></button>
          <button type="button" role="radio" aria-checked={model === "custom"} className={option(model === "custom")} onClick={() => pickModel("custom")}>{dot(model === "custom")}<span><span className="block text-sm font-medium">Customizado</span><span className="block text-xs text-muted">Você define as colunas. A primeira conta como pendente e a última como concluída.</span></span></button>
          {model === "custom" && (
            <div className="space-y-1.5 pl-6">
              {cols.map((c, i) => (
                <div key={c.id ?? `n${i}`} className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: colColor(i, cols.length) }} aria-hidden />
                  <input className="input h-9" value={c.name} onChange={(e) => editCol(i, e.target.value)} maxLength={30} placeholder={`Coluna ${i + 1}`} aria-label={`Nome da coluna ${i + 1}`} />
                  <button type="button" className="btn-subtle h-8 w-8 px-0" disabled={i === 0} onClick={() => moveCol(i, -1)} aria-label="Subir coluna"><ChevronUp className="h-3.5 w-3.5" /></button>
                  <button type="button" className="btn-subtle h-8 w-8 px-0" disabled={i === cols.length - 1} onClick={() => moveCol(i, 1)} aria-label="Descer coluna"><ChevronDown className="h-3.5 w-3.5" /></button>
                  <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setCols(cols.filter((_, j) => j !== i))} aria-label={`Remover coluna ${c.name || i + 1}`}><X className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {cols.length < 12 && <button type="button" className="flex items-center gap-1.5 text-sm text-muted hover:text-zinc-100" onClick={() => setCols([...cols, { name: "" }])}><Plus className="h-4 w-4" />Adicionar coluna</button>}
            </div>
          )}
          <button type="button" role="radio" aria-checked={model === "vazio"} className={option(model === "vazio")} onClick={() => pickModel("vazio")}>{dot(model === "vazio")}<span><span className="block text-sm font-medium">Em branco</span><span className="block text-xs text-muted">Adicionar colunas depois</span></span></button>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-medium">Acesso ao quadro</legend>
          <button type="button" role="radio" aria-checked={!restricted} className={option(!restricted)} onClick={() => setRestricted(false)}><Globe className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><span><span className="block text-sm font-medium">Toda a organização</span><span className="block text-xs text-muted">Todos os membros da equipe veem o quadro</span></span></button>
          <button type="button" role="radio" aria-checked={restricted} className={option(restricted)} onClick={() => setRestricted(true)}><Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted" /><span><span className="block text-sm font-medium">Restrito</span><span className="block text-xs text-muted">Só você ({owner}) e os membros escolhidos</span></span></button>
          {restricted && (members.length ? (
            <div className="flex flex-wrap gap-1.5 pl-6">
              {members.map((m) => {
                const on = memberIds.includes(m.id);
                return <button key={m.id} type="button" aria-pressed={on} onClick={() => setMemberIds(on ? memberIds.filter((x) => x !== m.id) : [...memberIds, m.id])} className={`flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs ${on ? "border-accent-light bg-accent-soft/40 text-white" : "border-line text-muted"}`}><Avatar name={m.name} color={m.color} size={4} />{m.name}</button>;
              })}
            </div>
          ) : <p className="pl-6 text-xs text-muted">Nenhum membro cadastrado: só você verá o quadro.</p>)}
        </fieldset>
      </form>
    </Modal>
  );
}
