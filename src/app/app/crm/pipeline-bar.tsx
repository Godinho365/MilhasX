"use client";
// Funis do CRM Passagens: trocar de funil, criar/renomear/excluir funil e editar as colunas (nome, cor, ordem).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { STAGE_COLORS } from "@/domain/pipelines";
import type { PipelineView } from "@/server/services/pipelines";

type Stage = PipelineView["stages"][number];

/** Fecha o menu ao clicar fora ou apertar Esc. */
function useDismiss(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", out);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", out); document.removeEventListener("keydown", esc); };
  }, [open, close]);
  return ref;
}

const MENU = "absolute z-40 mt-2 animate-pop-in rounded-xl border border-line bg-panel2 p-1 shadow-xl shadow-black/40";
const ITEM = "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-line disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent";

export function PipelinePicker({ pipelines, current }: { pipelines: PipelineView[]; current: PipelineView }) {
  const nav = useNav();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [naming, setNaming] = useState<"new" | "rename" | null>(null);
  const ref = useDismiss(open, () => setOpen(false));
  const orders = current.stages.reduce((t, s) => t + s.orders, 0);

  async function remove() {
    setOpen(false);
    if (!(await confirmDialog({ title: `Excluir o funil "${current.name}"?`, body: "As colunas dele também saem.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/pipelines/${current.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Funil excluído");
    nav("/app/crm");
    refreshSafe(router);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-ghost h-10 gap-2 font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="menu">
        <LayoutGrid className="h-4 w-4" />{current.name}<ChevronDown className="h-4 w-4 text-muted" />
      </button>
      {open && (
        <div role="menu" className={`${MENU} left-0 w-64`}>
          {pipelines.map((p) => (
            <button key={p.id} role="menuitemradio" aria-checked={p.id === current.id} className={ITEM} onClick={() => { setOpen(false); nav(`/app/crm?funil=${p.id}`); }}>
              <span className="flex-1 truncate">{p.name}</span>
              <span className="text-xs text-muted">{p.stages.reduce((t, s) => t + s.orders, 0) || ""}</span>
              {p.id === current.id && <Check className="h-4 w-4 text-accent-light" />}
            </button>
          ))}
          <div className="my-1 border-t border-line" />
          <button role="menuitem" className={ITEM} onClick={() => { setOpen(false); setNaming("rename"); }}><Pencil className="h-4 w-4" />Renomear este funil</button>
          <button role="menuitem" className={`${ITEM} text-red-300`} onClick={remove} disabled={pipelines.length <= 1 || orders > 0} title={orders > 0 ? "Mova os pedidos para outro funil antes de excluir" : pipelines.length <= 1 ? "Você precisa ter ao menos um funil" : undefined}><Trash2 className="h-4 w-4" />Excluir este funil</button>
          <button role="menuitem" className={ITEM} onClick={() => { setOpen(false); setNaming("new"); }}><Plus className="h-4 w-4" />Novo funil</button>
        </div>
      )}
      {naming && (
        <NameDialog
          title={naming === "new" ? "Novo funil" : "Renomear funil"}
          label="Nome do funil"
          initial={naming === "new" ? "" : current.name}
          hint={naming === "new" ? "O funil novo começa com as colunas A fazer, Em andamento e Concluído. Depois é só editar." : undefined}
          onClose={() => setNaming(null)}
          onSave={async (name) => {
            const r = naming === "new" ? await api<{ id: string }>("/api/pipelines", "POST", { name }) : await api(`/api/pipelines/${current.id}`, "PUT", { name });
            if (!r.ok) return r.erro;
            toast(naming === "new" ? "Funil criado" : "Funil renomeado");
            if (naming === "new") nav(`/app/crm?funil=${(r.data as { id: string }).id}`);
            refreshSafe(router);
            return null;
          }}
        />
      )}
    </div>
  );
}

/** Menu "..." da coluna: renomear, cor, mover para os lados e excluir. */
export function StageMenu({ stage, index, pipeline, pipelines }: { stage: Stage; index: number; pipeline: PipelineView; pipelines: PipelineView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));

  async function update(body: Record<string, unknown>, msg: string) {
    setOpen(false);
    const r = await api(`/api/pipeline-stages/${stage.id}`, "PUT", body);
    if (!r.ok) return toast(r.erro, "error");
    toast(msg);
    refreshSafe(router);
  }
  async function remove() {
    setOpen(false);
    if (stage.orders > 0) return setDeleting(true);
    if (!(await confirmDialog({ title: `Excluir a coluna "${stage.name}"?`, body: "A coluna está vazia.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/pipeline-stages/${stage.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Coluna excluída");
    refreshSafe(router);
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => setOpen((o) => !o)} aria-label={`Opções da coluna ${stage.name}`} aria-haspopup="menu" aria-expanded={open}><MoreHorizontal className="h-4 w-4" /></button>
      {open && (
        <div role="menu" className={`${MENU} right-0 w-56`}>
          <button role="menuitem" className={ITEM} onClick={() => { setOpen(false); setRenaming(true); }}><Pencil className="h-4 w-4" />Renomear</button>
          <div className="flex flex-wrap gap-1.5 px-3 py-2" role="group" aria-label="Cor da coluna">
            {STAGE_COLORS.map((c) => (
              <button key={c} type="button" onClick={() => update({ color: c }, "Cor trocada")} aria-label={`Cor ${c}`} aria-pressed={stage.color === c} className={`h-5 w-5 rounded-full ring-offset-2 ring-offset-panel2 ${stage.color === c ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: c }} />
            ))}
          </div>
          <button role="menuitem" className={ITEM} disabled={index === 0} onClick={() => update({ position: index - 1 }, "Coluna movida")}><ChevronLeft className="h-4 w-4" />Mover para a esquerda</button>
          <button role="menuitem" className={ITEM} disabled={index === pipeline.stages.length - 1} onClick={() => update({ position: index + 1 }, "Coluna movida")}><ChevronRight className="h-4 w-4" />Mover para a direita</button>
          <button role="menuitem" className={`${ITEM} text-red-300`} disabled={pipeline.stages.length <= 1} onClick={remove} title={pipeline.stages.length <= 1 ? "O funil precisa de ao menos uma coluna" : undefined}><Trash2 className="h-4 w-4" />Excluir coluna</button>
        </div>
      )}
      {renaming && (
        <NameDialog title="Renomear coluna" label="Nome da coluna" initial={stage.name} onClose={() => setRenaming(false)}
          onSave={async (name) => {
            const r = await api(`/api/pipeline-stages/${stage.id}`, "PUT", { name });
            if (!r.ok) return r.erro;
            toast("Coluna renomeada");
            refreshSafe(router);
            return null;
          }} />
      )}
      {deleting && <DeleteStageDialog stage={stage} pipeline={pipeline} pipelines={pipelines} onClose={() => setDeleting(false)} />}
    </div>
  );
}

/** Coluna com pedidos: escolhe para onde eles vão (qualquer coluna de qualquer funil). */
function DeleteStageDialog({ stage, pipeline, pipelines, onClose }: { stage: Stage; pipeline: PipelineView; pipelines: PipelineView[]; onClose: () => void }) {
  const router = useRouter();
  const first = pipeline.stages.find((s) => s.id !== stage.id);
  const [to, setTo] = useState(first?.id ?? "");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const r = await api(`/api/pipeline-stages/${stage.id}?moveTo=${encodeURIComponent(to)}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Coluna excluída e pedidos movidos");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={`Excluir a coluna "${stage.name}"`} size="sm" icon={<Trash2 className="h-5 w-5" />}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-danger" onClick={save} disabled={busy || !to}>Excluir e mover</button></>}>
      <div className="space-y-3">
        <p className="text-sm text-muted">A coluna tem {stage.orders} {stage.orders === 1 ? "pedido" : "pedidos"} (contando os arquivados). Para onde eles vão?</p>
        <Field label="Mover para">
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Coluna de destino">
            {pipelines.map((p) => (
              <optgroup key={p.id} label={p.name}>
                {p.stages.filter((s) => s.id !== stage.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        {erro && <Alert kind="error">{erro}</Alert>}
      </div>
    </Modal>
  );
}

/** Botão "Nova coluna" no fim do quadro. */
export function NewStage({ pipeline }: { pipeline: PipelineView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-12 w-[260px] shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line text-sm text-muted transition-colors hover:border-zinc-500 hover:text-zinc-100">
        <Plus className="h-4 w-4" />Nova coluna
      </button>
      {open && (
        <NameDialog title="Nova coluna" label="Nome da coluna" initial="" onClose={() => setOpen(false)}
          onSave={async (name) => {
            const color = STAGE_COLORS[pipeline.stages.length % STAGE_COLORS.length];
            const r = await api(`/api/pipelines/${pipeline.id}/stages`, "POST", { name, color });
            if (!r.ok) return r.erro;
            toast("Coluna criada");
            refreshSafe(router);
            return null;
          }} />
      )}
    </>
  );
}

/** Pede um nome (funil ou coluna). onSave devolve a mensagem de erro, ou null quando deu certo. */
function NameDialog({ title, label, initial, hint, onClose, onSave }: { title: string; label: string; initial: string; hint?: string; onClose: () => void; onSave: (name: string) => Promise<string | null> }) {
  const [name, setName] = useState(initial);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErro("Dê um nome");
    setBusy(true);
    const err = await onSave(name.trim());
    setBusy(false);
    if (err) return setErro(err);
    onClose();
  }
  return (
    <Modal open onClose={onClose} title={title} size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="name-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="name-form" onSubmit={save} className="space-y-3">
        <Field label={label} required><input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus aria-label={label} /></Field>
        {hint && <p className="text-xs text-muted">{hint}</p>}
        {erro && <Alert kind="error">{erro}</Alert>}
      </form>
    </Modal>
  );
}
