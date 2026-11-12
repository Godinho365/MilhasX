"use client";
// Processos: o fluxograma de cada processo da operação (início, etapas, decisões, fim e notas), com o seletor de
// processos, criar (em branco, de um modelo ou gerado pela IA), "Pergunte à IA" sobre os processos, organizar,
// ver como lista e "Usar" (cada etapa vira uma tarefa no quadro).
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus, Trash2, Workflow, Play, Sparkles, MessageCircleQuestion, Save, Square, Diamond, StickyNote, CircleStop, LayoutGrid, List,
  Map as MapIcon, X, Send, ArrowLeftRight, Copy, ExternalLink,
} from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import {
  APP_PAGES, NODE_KINDS, TEMPLATES, cleanFlow, layoutFlow, newId, pageLabel, stepsOf,
  type Flow, type FlowNode, type NodeKind,
} from "@/domain/process-flow";
import { FlowCanvas, type CanvasHandle, type Selection } from "./flow-canvas";

type P = { id: string; title: string; description: string | null; flow: Flow };
type M = { id: string; name: string };
type Doc = { id: string | null; title: string; description: string; flow: Flow };
const ROLES = ["Atendimento", "Emissor", "Financeiro", "Administrador"];
const blank = (): Flow => layoutFlow(cleanFlow({
  nodes: [{ id: "n1", kind: "start", title: "Início" }, { id: "n2", kind: "step", title: "Primeira etapa" }, { id: "n3", kind: "end", title: "Fim" }],
  edges: [{ from: "n1", to: "n2" }, { from: "n2", to: "n3" }],
}));

export function ProcessesClient({ processes, members, canEdit, ai, initialId }: { processes: P[]; members: M[]; canEdit: boolean; ai: { enabled: boolean; owner: boolean }; initialId: string | null }) {
  const router = useRouter();
  const canvas = useRef<CanvasHandle>(null);
  const first = processes.find((p) => p.id === initialId) ?? processes[0] ?? null;
  const [doc, setDoc] = useState<Doc | null>(first ? { id: first.id, title: first.title, description: first.description ?? "", flow: first.flow } : null);
  const [dirty, setDirty] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [locked, setLocked] = useState(false);
  const [view, setView] = useState<"mapa" | "lista">("mapa");
  const [creating, setCreating] = useState(false);
  const [asking, setAsking] = useState(false);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (doc?.id) url.searchParams.set("processo", doc.id); else url.searchParams.delete("processo");
    window.history.replaceState(window.history.state, "", url);
  }, [doc?.id]);

  const edit = (flow: Flow) => { setDoc((d) => (d ? { ...d, flow } : d)); setDirty(true); };
  async function open(next: Doc | null) {
    if (dirty && !(await confirmDialog({ title: "Descartar as alterações?", body: "O fluxograma tem alterações que não foram salvas.", confirmLabel: "Descartar", danger: true }))) return false;
    setDoc(next); setDirty(!!next && !next.id); setSelection(null); setView("mapa"); setCanvasKey((k) => k + 1);
    return true;
  }
  async function save() {
    if (!doc || !canEdit) return;
    if (!doc.title.trim()) return toast("Dê um nome ao processo", "error");
    setSaving(true);
    const body = { title: doc.title, description: doc.description || null, flow: doc.flow };
    const r = doc.id ? await api(`/api/processes/${doc.id}`, "PUT", body) : await api<{ id: string }>("/api/processes", "POST", body);
    setSaving(false);
    if (!r.ok) return toast(r.erro, "error");
    if (!doc.id) setDoc({ ...doc, id: (r.data as { id: string }).id });
    setDirty(false);
    toast("Processo salvo");
    refreshSafe(router);
  }
  async function remove() {
    if (!doc) return;
    if (!doc.id) { setDoc(null); setDirty(false); return; }
    if (!(await confirmDialog({ title: "Excluir processo?", body: doc.title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/processes/${doc.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Processo excluído");
    setDirty(false);
    const rest = processes.filter((p) => p.id !== doc.id);
    setDoc(rest[0] ? { id: rest[0].id, title: rest[0].title, description: rest[0].description ?? "", flow: rest[0].flow } : null);
    setCanvasKey((k) => k + 1);
    refreshSafe(router);
  }
  function add(kind: NodeKind) {
    if (!doc) return;
    const c = canvas.current?.center() ?? { x: 0, y: 0 };
    const id = newId(doc.flow);
    const n: FlowNode = { id, kind, x: Math.round(c.x - NODE_KINDS[kind].w / 2), y: Math.round(c.y - NODE_KINDS[kind].h / 2), title: kind === "note" ? "Atenção" : kind === "decision" ? "Pergunta?" : kind === "end" ? "Fim" : "Nova etapa", detail: null, owner: null, link: null };
    // a caixa nova liga na selecionada
    const sel = selection?.type === "node" ? doc.flow.nodes.find((x) => x.id === selection.id) : undefined;
    const link = sel && sel.kind !== "note" && sel.kind !== "end" && kind !== "note" ? [{ id: newId({ ...doc.flow, nodes: [...doc.flow.nodes, n] }, "e"), from: sel.id, to: id, label: null }] : [];
    if (sel && link.length) { n.x = sel.x + Math.round((NODE_KINDS[sel.kind].w - NODE_KINDS[kind].w) / 2); n.y = sel.y + NODE_KINDS[sel.kind].h + 70; }
    edit({ nodes: [...doc.flow.nodes, n], edges: [...doc.flow.edges, ...link] });
    setSelection({ type: "node", id });
  }
  function connect(from: string, to: string) {
    if (!doc || doc.flow.edges.some((e) => e.from === from && e.to === to)) return;
    const next = cleanFlow({ ...doc.flow, edges: [...doc.flow.edges, { id: newId(doc.flow, "e"), from, to, label: null }] });
    if (next.edges.length === doc.flow.edges.length) return toast("Essa ligação não é possível (fim não tem saída, início não tem entrada, nota não liga)", "error");
    edit(next);
  }
  function del() {
    if (!doc || !selection) return;
    if (selection.type === "edge") edit({ ...doc.flow, edges: doc.flow.edges.filter((e) => e.id !== selection.id) });
    else edit({ nodes: doc.flow.nodes.filter((n) => n.id !== selection.id), edges: doc.flow.edges.filter((e) => e.from !== selection.id && e.to !== selection.id) });
    setSelection(null);
  }

  const steps = useMemo(() => (doc ? stepsOf(doc.flow) : []), [doc]);
  const selNode = doc && selection?.type === "node" ? doc.flow.nodes.find((n) => n.id === selection.id) ?? null : null;
  const selEdge = doc && selection?.type === "edge" ? doc.flow.edges.find((e) => e.id === selection.id) ?? null : null;
  const editable = canEdit && !locked;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input h-9 w-full sm:w-72" value={doc?.id ?? (doc ? "novo" : "")} aria-label="Processo"
          onChange={(e) => { const p = processes.find((x) => x.id === e.target.value); if (p) void open({ id: p.id, title: p.title, description: p.description ?? "", flow: p.flow }); }}>
          {!doc && <option value="">Selecione um processo</option>}
          {doc && !doc.id && <option value="novo">{doc.title || "Novo processo"} (não salvo)</option>}
          {processes.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
        </select>
        {canEdit && <button type="button" className="btn-ghost h-9" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Novo</button>}
        <button type="button" className="btn-ghost h-9" onClick={() => setAsking(true)}><MessageCircleQuestion className="h-4 w-4" />Pergunte à IA</button>
        <span className="flex-1" />
        {doc && (
          <>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Ver como">
              {([["mapa", "Fluxograma", MapIcon], ["lista", "Lista", List]] as const).map(([k, l, I]) => (
                <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => setView(k)} className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-sm font-medium ${view === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}><I className="h-3.5 w-3.5" />{l}</button>
              ))}
            </div>
            {canEdit && <button type="button" className="btn-ghost h-9" disabled={dirty || !doc.id || !steps.length} title={dirty ? "Salve antes de usar" : undefined} onClick={() => setRunning(true)}><Play className="h-4 w-4" />Usar</button>}
            {canEdit && <button type="button" className="btn-primary h-9" disabled={!dirty || saving} onClick={() => void save()}><Save className="h-4 w-4" />{saving ? "Salvando..." : dirty ? "Salvar" : "Salvo"}</button>}
          </>
        )}
      </div>

      {!doc ? (
        <Empty title="Crie ou selecione um processo para começar" icon={<Workflow className="h-5 w-5" />}>
          <p className="max-w-md text-sm text-muted">Desenhe o passo a passo de como a sua operação faz cada coisa: etapas, decisões e quem faz. Depois a equipe consulta, pergunta à IA e usa: cada etapa vira uma tarefa no quadro.</p>
          {canEdit && <button type="button" className="btn-primary" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Criar processo</button>}
        </Empty>
      ) : (
        <div className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
            {canEdit ? (
              <>
                <input className="input h-9 min-w-[200px] flex-1 font-semibold" value={doc.title} maxLength={120} placeholder="Nome do processo" aria-label="Nome do processo" onChange={(e) => { setDoc({ ...doc, title: e.target.value }); setDirty(true); }} />
                <input className="input h-9 min-w-[200px] flex-[2]" value={doc.description} maxLength={1000} placeholder="Para que serve" aria-label="Para que serve" onChange={(e) => { setDoc({ ...doc, description: e.target.value }); setDirty(true); }} />
                <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => void remove()} aria-label="Excluir processo"><Trash2 className="h-4 w-4" /></button>
              </>
            ) : (
              <div><p className="font-semibold">{doc.title}</p>{doc.description && <p className="text-sm text-muted">{doc.description}</p>}</div>
            )}
          </div>
          {view === "mapa" && editable && (
            <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-1.5" role="toolbar" aria-label="Inserir">
              <span className="mr-1 text-xs text-muted">Inserir:</span>
              <button type="button" className="btn-subtle h-8 text-xs" onClick={() => add("step")}><Square className="h-3.5 w-3.5" />Etapa</button>
              <button type="button" className="btn-subtle h-8 text-xs" onClick={() => add("decision")}><Diamond className="h-3.5 w-3.5" />Decisão</button>
              <button type="button" className="btn-subtle h-8 text-xs" onClick={() => add("end")}><CircleStop className="h-3.5 w-3.5" />Fim</button>
              <button type="button" className="btn-subtle h-8 text-xs" onClick={() => add("note")}><StickyNote className="h-3.5 w-3.5" />Nota</button>
              <span className="mx-1 h-5 w-px bg-line" />
              <button type="button" className="btn-subtle h-8 text-xs" onClick={() => { edit(layoutFlow(doc.flow)); setTimeout(() => canvas.current?.fit(), 0); }}><LayoutGrid className="h-3.5 w-3.5" />Organizar</button>
              <span className="ml-auto hidden text-[11px] text-muted md:inline">Puxe a bolinha de baixo de uma caixa até outra para ligar · Delete apaga · setas movem</span>
            </div>
          )}
          {view === "mapa" ? (
            <div className="relative flex h-[calc(100vh-300px)] min-h-[460px]">
              <div className="min-w-0 flex-1">
                <FlowCanvas key={canvasKey} ref={canvas} flow={doc.flow} editable={canEdit} locked={locked} selection={selection}
                  onSelect={setSelection} onChange={edit} onConnect={connect} onToggleLock={() => setLocked((l) => !l)} onDelete={del} />
              </div>
              {(selNode || selEdge) && (
                <aside className="absolute inset-y-0 right-0 z-10 w-full max-w-xs overflow-y-auto border-l border-line bg-panel p-4 shadow-xl sm:static sm:shadow-none" aria-label="Propriedades">
                  {selNode && <NodePanel key={selNode.id} n={selNode} flow={doc.flow} editable={editable} members={members} onChange={edit} onDelete={del} onClose={() => setSelection(null)} onSelect={setSelection} />}
                  {selEdge && <EdgePanel key={selEdge.id} edgeId={selEdge.id} flow={doc.flow} editable={editable} onChange={edit} onDelete={del} onClose={() => setSelection(null)} />}
                </aside>
              )}
            </div>
          ) : (
            <StepList flow={doc.flow} />
          )}
        </div>
      )}

      {creating && <NewDialog ai={ai} onClose={() => setCreating(false)} onCreate={async (d) => { if (await open(d)) { setCreating(false); setDirty(true); } }} />}
      {asking && <AskPanel ai={ai} count={processes.length} onClose={() => setAsking(false)} />}
      {running && doc?.id && <RunDialog id={doc.id} title={doc.title} count={steps.length} members={members} onClose={() => setRunning(false)} />}
    </div>
  );
}

function StepList({ flow }: { flow: Flow }) {
  const steps = stepsOf(flow);
  const notes = flow.nodes.filter((n) => n.kind === "note" && (n.title || n.detail));
  return (
    <div className="space-y-3 p-4">
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-panel2 text-xs font-semibold text-muted">{i + 1}</span>
            <span><span className="font-medium">{s.title}</span>{s.detail && <span className="block whitespace-pre-line text-xs text-muted">{s.detail}</span>}</span>
          </li>
        ))}
      </ol>
      {notes.map((n) => <p key={n.id} className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm"><span className="font-semibold text-amber-400">{n.title}</span>{n.detail ? ` ${n.detail}` : ""}</p>)}
      {!steps.length && <p className="text-sm text-muted">Ainda não há etapas neste fluxograma.</p>}
    </div>
  );
}

function NodePanel({ n, flow, editable, members, onChange, onDelete, onClose, onSelect }: { n: FlowNode; flow: Flow; editable: boolean; members: M[]; onChange: (f: Flow) => void; onDelete: () => void; onClose: () => void; onSelect: (s: Selection) => void }) {
  const set = (patch: Partial<FlowNode>) => onChange({ ...flow, nodes: flow.nodes.map((x) => (x.id === n.id ? { ...x, ...patch } : x)) });
  const byId = new Map(flow.nodes.map((x) => [x.id, x]));
  const outs = flow.edges.filter((e) => e.from === n.id);
  const ins = flow.edges.filter((e) => e.to === n.id);
  const [target, setTarget] = useState("");
  const targets = flow.nodes.filter((x) => x.id !== n.id && x.kind !== "note" && x.kind !== "start" && !outs.some((e) => e.to === x.id));
  const canLink = n.kind !== "note" && n.kind !== "end";
  function duplicate() {
    const id = newId(flow);
    onChange({ ...flow, nodes: [...flow.nodes, { ...n, id, x: n.x + 30, y: n.y + 30 }] });
    onSelect({ type: "node", id });
  }
  const ro = !editable;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <p className="kicker flex-1">{NODE_KINDS[n.kind].label}</p>
        <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>
      {editable && (
        <Field label="Tipo">
          <select className="input" value={n.kind} onChange={(e) => set({ kind: e.target.value as NodeKind })} aria-label="Tipo da caixa">
            {(Object.keys(NODE_KINDS) as NodeKind[]).map((k) => <option key={k} value={k}>{NODE_KINDS[k].label}</option>)}
          </select>
        </Field>
      )}
      <Field label={n.kind === "decision" ? "Pergunta" : "Texto"}>
        <textarea className="input min-h-[60px] py-2" readOnly={ro} maxLength={200} value={n.title} onChange={(e) => set({ title: e.target.value })} aria-label={n.kind === "decision" ? "Pergunta" : "Texto da caixa"} />
      </Field>
      <Field label={n.kind === "note" ? "Nota" : "Como fazer"}>
        <textarea className="input min-h-[80px] py-2" readOnly={ro} maxLength={1000} value={n.detail ?? ""} placeholder={ro ? "" : "Detalhes, cuidados, modelos de mensagem..."} onChange={(e) => set({ detail: e.target.value || null })} aria-label="Detalhes" />
      </Field>
      {n.kind !== "note" && (
        <>
          <Field label="Responsável">
            <input className="input" list="proc-owners" readOnly={ro} maxLength={80} value={n.owner ?? ""} placeholder={ro ? "" : "Função ou pessoa"} onChange={(e) => set({ owner: e.target.value || null })} aria-label="Responsável" />
            <datalist id="proc-owners">{[...ROLES, ...members.map((m) => m.name)].map((o) => <option key={o} value={o} />)}</datalist>
          </Field>
          <Field label="Onde fazer no app">
            {ro ? (
              n.link ? <Link href={n.link} className="inline-flex items-center gap-1 text-sm text-accent-light hover:underline"><ExternalLink className="h-3.5 w-3.5" />{pageLabel(n.link)}</Link> : <p className="text-sm text-muted">—</p>
            ) : (
              <select className="input" value={n.link ?? ""} onChange={(e) => set({ link: e.target.value || null })} aria-label="Onde fazer no app">
                <option value="">Nenhuma página</option>
                {APP_PAGES.map(([p, l]) => <option key={p} value={p}>{l}</option>)}
              </select>
            )}
          </Field>
          {editable && n.link && <Link href={n.link} className="inline-flex items-center gap-1 text-xs text-accent-light hover:underline"><ExternalLink className="h-3.5 w-3.5" />Abrir {pageLabel(n.link)}</Link>}
        </>
      )}
      {canLink && (
        <div className="space-y-1.5">
          <p className="label">Segue para</p>
          {outs.length === 0 && <p className="text-xs text-muted">Nenhuma ligação saindo.</p>}
          {outs.map((e) => (
            <div key={e.id} className="flex items-center gap-1.5">
              {n.kind === "decision" && <input className="input h-8 w-20 text-xs" readOnly={ro} maxLength={40} value={e.label ?? ""} placeholder="Sim/Não" aria-label={`Saída para ${byId.get(e.to)?.title}`} onChange={(ev) => onChange({ ...flow, edges: flow.edges.map((x) => (x.id === e.id ? { ...x, label: ev.target.value || null } : x)) })} />}
              <button type="button" className="min-w-0 flex-1 truncate text-left text-sm hover:underline" onClick={() => onSelect({ type: "node", id: e.to })}>→ {byId.get(e.to)?.title || "?"}</button>
              {editable && <button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => onChange({ ...flow, edges: flow.edges.filter((x) => x.id !== e.id) })} aria-label={`Tirar a ligação para ${byId.get(e.to)?.title}`}><X className="h-3.5 w-3.5" /></button>}
            </div>
          ))}
          {editable && targets.length > 0 && (
            <div className="flex gap-1.5">
              <select className="input h-8 flex-1 text-xs" value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Ligar a">
                <option value="">Ligar a...</option>
                {targets.map((x) => <option key={x.id} value={x.id}>{x.title || NODE_KINDS[x.kind].label}</option>)}
              </select>
              <button type="button" className="btn-ghost h-8 text-xs" disabled={!target} onClick={() => { onChange(cleanFlow({ ...flow, edges: [...flow.edges, { id: newId(flow, "e"), from: n.id, to: target, label: null }] })); setTarget(""); }}>Ligar</button>
            </div>
          )}
        </div>
      )}
      {ins.length > 0 && <p className="text-xs text-muted">Vem de: {ins.map((e) => byId.get(e.from)?.title).filter(Boolean).join(", ")}</p>}
      {editable && (
        <div className="flex gap-2 border-t border-line pt-3">
          <button type="button" className="btn-ghost h-8 text-xs" onClick={duplicate}><Copy className="h-3.5 w-3.5" />Duplicar</button>
          <button type="button" className="btn-danger h-8 text-xs" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
        </div>
      )}
    </div>
  );
}

function EdgePanel({ edgeId, flow, editable, onChange, onDelete, onClose }: { edgeId: string; flow: Flow; editable: boolean; onChange: (f: Flow) => void; onDelete: () => void; onClose: () => void }) {
  const e = flow.edges.find((x) => x.id === edgeId)!;
  const byId = new Map(flow.nodes.map((x) => [x.id, x]));
  const set = (label: string | null) => onChange({ ...flow, edges: flow.edges.map((x) => (x.id === e.id ? { ...x, label } : x)) });
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2"><p className="kicker flex-1">Ligação</p><button type="button" className="btn-subtle h-8 w-8 px-0" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button></div>
      <p className="text-sm">{byId.get(e.from)?.title} <span className="text-muted">→</span> {byId.get(e.to)?.title}</p>
      <Field label="Texto na seta" hint="Numa decisão: Sim, Não ou a opção">
        <input className="input" readOnly={!editable} maxLength={40} value={e.label ?? ""} onChange={(ev) => set(ev.target.value || null)} aria-label="Texto na seta" />
      </Field>
      {editable && (
        <div className="flex flex-wrap gap-2">
          {["Sim", "Não"].map((l) => <button key={l} type="button" className="btn-subtle h-8 text-xs" onClick={() => set(l)}>{l}</button>)}
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => onChange(cleanFlow({ ...flow, edges: flow.edges.map((x) => (x.id === e.id ? { ...x, from: x.to, to: x.from } : x)) }))}><ArrowLeftRight className="h-3.5 w-3.5" />Inverter</button>
          <button type="button" className="btn-danger h-8 text-xs" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" />Excluir</button>
        </div>
      )}
    </div>
  );
}

function NewDialog({ ai, onClose, onCreate }: { ai: { enabled: boolean; owner: boolean }; onClose: () => void; onCreate: (d: Doc) => void }) {
  const [mode, setMode] = useState<"blank" | "ai" | number>("blank");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function go(e: React.FormEvent) {
    e.preventDefault();
    setErro("");
    if (typeof mode === "number") {
      const t = TEMPLATES[mode]!;
      return onCreate({ id: null, title: title.trim() || t.title, description: description.trim() || t.description, flow: t.flow() });
    }
    if (mode === "blank") {
      if (!title.trim()) return setErro("Dê um nome ao processo");
      return onCreate({ id: null, title: title.trim(), description: description.trim(), flow: blank() });
    }
    setBusy(true);
    const r = await api<{ draft: { title: string; description: string | null; flow: Flow } }>("/api/processes/generate", "POST", { description: prompt });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    const d = r.data.draft;
    onCreate({ id: null, title: title.trim() || d.title, description: description.trim() || d.description || "", flow: d.flow });
    toast("Rascunho pronto: revise e salve");
  }
  const opt = (on: boolean) => `rounded-xl border p-3 text-left text-sm ${on ? "border-accent-light bg-accent-soft" : "border-line hover:border-zinc-600"}`;
  return (
    <Modal open onClose={onClose} title="Novo processo" size="lg" icon={<Workflow className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="new-proc" className="btn-primary" disabled={busy || (mode === "ai" && !ai.enabled)}>{mode === "ai" ? (busy ? "Gerando..." : "Gerar com IA") : "Criar"}</button></>}>
      <form id="new-proc" onSubmit={go} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Começar com">
          <button type="button" role="radio" aria-checked={mode === "blank"} className={opt(mode === "blank")} onClick={() => setMode("blank")}><span className="font-semibold">Em branco</span><span className="block text-xs text-muted">Início, uma etapa e o fim</span></button>
          <button type="button" role="radio" aria-checked={mode === "ai"} className={opt(mode === "ai")} onClick={() => setMode("ai")}><span className="inline-flex items-center gap-1 font-semibold"><Sparkles className="h-3.5 w-3.5" />Gerar com IA</span><span className="block text-xs text-muted">Descreva com suas palavras e a IA desenha</span></button>
          {TEMPLATES.map((t, i) => (
            <button key={t.title} type="button" role="radio" aria-checked={mode === i} className={opt(mode === i)} onClick={() => setMode(i)}><span className="font-semibold">Modelo: {t.title}</span><span className="block text-xs text-muted">{t.description}</span></button>
          ))}
        </div>
        {mode === "ai" && (
          ai.enabled ? (
            <Field label="Como é o processo" hint="Quem faz, as etapas, as decisões e o que acontece em cada caso">
              <textarea className="input min-h-[120px] py-2" maxLength={3000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ex.: quando um cliente pede cotação no WhatsApp, o atendimento confirma datas e passageiros, o emissor busca em milhas e em dinheiro, mandamos as duas opções..." aria-label="Como é o processo" required />
            </Field>
          ) : <AiOff owner={ai.owner} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nome do processo" hint={mode === "blank" ? undefined : "Vazio: usa o do modelo ou o que a IA sugerir"}><input className="input" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} aria-label="Nome do novo processo" /></Field>
          <Field label="Para que serve"><input className="input" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} aria-label="Para que serve o novo processo" /></Field>
        </div>
      </form>
    </Modal>
  );
}

function AiOff({ owner }: { owner: boolean }) {
  return (
    <Alert kind="info">
      A IA não está ligada neste servidor. {owner ? <>Para ligar, coloque a chave da Anthropic na variável <code className="font-mono">ANTHROPIC_API_KEY</code> do servidor e reinicie o app.</> : "Fale com o dono da conta."}
    </Alert>
  );
}

type Msg = { role: "user" | "assistant"; content: string };
function AskPanel({ ai, count, onClose }: { ai: { enabled: boolean; owner: boolean }; count: number; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy]);
  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy) return;
    setErro("");
    setBusy(true);
    setQ("");
    const history = msgs;
    setMsgs([...history, { role: "user", content: question }]);
    const r = await api<{ answer: string }>("/api/processes/ask", "POST", { question, history });
    setBusy(false);
    if (!r.ok) { setErro(r.erro); setMsgs(history); setQ(question); return; }
    setMsgs([...history, { role: "user", content: question }, { role: "assistant", content: r.data.answer }]);
  }
  const examples = ["Quem faz o check-in do cliente?", "O que fazer quando o cliente desiste da compra?", "Quais etapas o financeiro faz?"];
  return (
    <Modal open onClose={onClose} title="Pergunte à IA" size="md" icon={<MessageCircleQuestion className="h-5 w-5" />}>
      <div className="space-y-3">
        <p className="text-sm text-muted">Tire dúvidas sobre os processos da agência. A IA responde lendo os {count === 1 ? "fluxogramas do processo salvo" : `${count} processos salvos`}.</p>
        {!ai.enabled ? <AiOff owner={ai.owner} /> : (
          <>
            <div className="max-h-[50vh] space-y-2 overflow-y-auto" aria-live="polite">
              {msgs.length === 0 && (
                <div className="flex flex-wrap gap-2">{examples.map((x) => <button key={x} type="button" className="pill hover:border-zinc-500" onClick={() => void ask(x)}>{x}</button>)}</div>
              )}
              {msgs.map((m, i) => (
                <div key={i} className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-8 bg-accent-soft" : "mr-8 bg-panel2"}`}>{m.content}</div>
              ))}
              {busy && <div className="mr-8 rounded-xl bg-panel2 px-3 py-2 text-sm text-muted">Pensando...</div>}
              <div ref={end} />
            </div>
            {erro && <Alert>{erro}</Alert>}
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(q); }}>
              <input className="input flex-1" value={q} maxLength={1000} onChange={(e) => setQ(e.target.value)} placeholder="Sua pergunta" aria-label="Sua pergunta" />
              <button className="btn-primary" disabled={busy || q.trim().length < 2} aria-label="Perguntar"><Send className="h-4 w-4" /></button>
            </form>
            <p className="text-[11px] text-muted">A IA pode errar: confira no fluxograma antes de seguir.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

function RunDialog({ id, title, count, members, onClose }: { id: string; title: string; count: number; members: M[]; onClose: () => void }) {
  const nav = useNav();
  const [label, setLabel] = useState("");
  const [memberId, setMemberId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [erro, setErro] = useState("");
  async function run(e: React.FormEvent) {
    e.preventDefault();
    const r = await api<{ created: number }>(`/api/processes/${id}/run`, "POST", { label: label || null, memberId: memberId || null, dueDate: dueDate || null });
    if (!r.ok) return setErro(r.erro);
    toast(`${r.data.created} tarefas criadas`);
    onClose();
    nav("/app/equipe/tarefas");
  }
  return (
    <Modal open onClose={onClose} title={`Usar: ${title}`} size="sm" icon={<Play className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="run-form" className="btn-primary">Criar {count} tarefas</button></>}>
      <form id="run-form" onSubmit={run} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Cada etapa e cada decisão vira uma tarefa em &quot;A fazer&quot;, na ordem do fluxograma.</p>
        <Field label="Para quê" hint="Vai no começo de cada tarefa"><input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} placeholder="Ex.: Pedido #12 Maria" aria-label="Para quê" /></Field>
        <Field label="Responsável"><select className="input" value={memberId} onChange={(e) => setMemberId(e.target.value)} aria-label="Responsável"><option value="">Ninguém (você)</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Prazo"><input className="input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="Prazo" /></Field>
      </form>
    </Modal>
  );
}
