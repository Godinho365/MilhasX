"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api, today } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type N = { id: string; title: string; body: string; publishedAt: string; published: boolean };

export function NewsAdmin({ items }: { items: N[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<N | "new" | null>(null);
  const [erro, setErro] = useState("");
  const cur = edit && edit !== "new" ? edit : null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = { title: f.get("title"), body: f.get("body"), publishedAt: f.get("publishedAt"), published: f.get("published") === "on" };
    const r = cur ? await api(`/api/admin/news/${cur.id}`, "PATCH", body) : await api("/api/admin/news", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setEdit(null);
    toast(cur ? "Novidade atualizada" : "Novidade publicada");
    refreshSafe(router);
  }
  async function remove(n: N) {
    if (!(await confirmDialog({ title: `Excluir “${n.title}”?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/admin/news/${n.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Novidade excluída");
    refreshSafe(router);
  }
  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => { setErro(""); setEdit("new"); }}><Plus className="h-4 w-4" />Nova publicação</button></div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Título</th><th>Data</th><th>Status</th><th className="w-24"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id}>
                <td className="font-semibold">{n.title}</td>
                <td className="whitespace-nowrap text-muted">{fmtDate(n.publishedAt)}</td>
                <td>{n.published ? <span className="text-ok">Publicada</span> : <span className="text-muted">Rascunho</span>}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => { setErro(""); setEdit(n); }} aria-label={`Editar ${n.title}`}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(n)} aria-label={`Excluir ${n.title}`}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="py-10 text-center text-muted">Nenhuma publicação.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={cur ? "Editar novidade" : "Nova novidade"} footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button form="news-form" className="btn-primary">Salvar</button></>}>
        <form id="news-form" onSubmit={save} className="space-y-4" key={cur?.id ?? "new"}>
          {erro && <Alert>{erro}</Alert>}
          <Field label="Título" required><input className="input" name="title" required maxLength={140} defaultValue={cur?.title} /></Field>
          <Field label="Data de publicação" required><input className="input" type="date" name="publishedAt" required defaultValue={cur?.publishedAt ?? today()} /></Field>
          <Field label="Texto" required><textarea className="input min-h-[160px] py-2" name="body" required maxLength={5000} defaultValue={cur?.body} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="published" defaultChecked={cur?.published ?? true} /> Publicada</label>
        </form>
      </Modal>
    </>
  );
}
