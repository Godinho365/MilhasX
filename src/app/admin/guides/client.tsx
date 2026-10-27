"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type G = { id: string; slug: string; kind: string; title: string; summary: string; body: string; level: string; minutes: number; tags: string; videoUrl: string; order: number; published: boolean };
const LEVELS = [["BEGINNER", "Iniciante"], ["INTERMEDIATE", "Intermediário"], ["ADVANCED", "Avançado"]] as const;

export function GuidesAdmin({ items }: { items: G[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<G | "new" | null>(null);
  const [erro, setErro] = useState("");
  const cur = edit && edit !== "new" ? edit : null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      slug: f.get("slug"), kind: f.get("kind"), title: f.get("title"), summary: f.get("summary"), body: f.get("body"), level: f.get("level"),
      minutes: Number(f.get("minutes") || 5), tags: String(f.get("tags") || "").split(",").map((t) => t.trim()).filter(Boolean),
      videoUrl: f.get("videoUrl") || null, order: Number(f.get("order") || 0), published: f.get("published") === "on",
    };
    const r = cur ? await api(`/api/admin/guides/${cur.id}`, "PATCH", body) : await api("/api/admin/guides", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setEdit(null);
    toast(cur ? "Guia atualizado" : "Guia criado");
    refreshSafe(router);
  }
  async function remove(g: G) {
    if (!(await confirmDialog({ title: `Excluir “${g.title}”?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/admin/guides/${g.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Guia excluído");
    refreshSafe(router);
  }
  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => { setErro(""); setEdit("new"); }}><Plus className="h-4 w-4" />Novo guia</button></div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Título</th><th>Tipo</th><th className="hidden sm:table-cell">Endereço</th><th>Status</th><th className="w-24"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                <td className="font-semibold">{g.title}</td>
                <td className="text-muted">{g.kind === "VIDEO" ? "Tutorial" : "Guia"}</td>
                <td className="hidden text-muted sm:table-cell"><code className="text-xs">/app/guides/{g.slug}</code></td>
                <td>{g.published ? <span className="text-ok">Publicado</span> : <span className="text-muted">Rascunho</span>}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => { setErro(""); setEdit(g); }} aria-label={`Editar ${g.title}`}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(g)} aria-label={`Excluir ${g.title}`}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted">Nenhum guia.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} size="lg" title={cur ? "Editar guia" : "Novo guia"} footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button form="guide-form" className="btn-primary">Salvar</button></>}>
        <form id="guide-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" key={cur?.id ?? "new"}>
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          <Field label="Título" required><input className="input" name="title" required maxLength={120} defaultValue={cur?.title} /></Field>
          <Field label="Endereço (slug)" required hint="letras minúsculas, números e hífen"><input className="input" name="slug" required pattern="[a-z0-9\-]+" defaultValue={cur?.slug} /></Field>
          <Field label="Tipo" required><select className="input" name="kind" defaultValue={cur?.kind ?? "ARTICLE"}><option value="ARTICLE">Guia (texto)</option><option value="VIDEO">Tutorial</option></select></Field>
          <Field label="Nível" required><select className="input" name="level" defaultValue={cur?.level ?? "BEGINNER"}>{LEVELS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Duração (min)"><input className="input" name="minutes" type="number" min={1} max={240} defaultValue={cur?.minutes ?? 5} /></Field>
          <Field label="Ordem"><input className="input" name="order" type="number" min={0} max={1000} defaultValue={cur?.order ?? 0} /></Field>
          <Field label="Resumo" required className="sm:col-span-2"><input className="input" name="summary" required maxLength={300} defaultValue={cur?.summary} /></Field>
          <Field label="Tags" hint="separadas por vírgula"><input className="input" name="tags" defaultValue={cur?.tags} /></Field>
          <Field label="Vídeo (YouTube ou Vimeo)"><input className="input" name="videoUrl" type="url" placeholder="https://" defaultValue={cur?.videoUrl} /></Field>
          <Field label="Conteúdo" hint="Linha em branco separa parágrafos; “## ” cria subtítulo; “- ” cria lista" className="sm:col-span-2"><textarea className="input min-h-[220px] py-2 font-mono text-[13px]" name="body" maxLength={20000} defaultValue={cur?.body} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={cur?.published ?? true} /> Publicado</label>
        </form>
      </Modal>
    </>
  );
}
