"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api, today } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

const KINDS = [["TRANSFER_BONUS", "Bônus de transferência"], ["PURCHASE_BONUS", "Compra de pontos"], ["CLUB", "Clube"], ["SHOPPING", "Compras"], ["OTHER", "Outra"]] as const;
type P = { id: string; kind: string; title: string; description: string; fromProgramId: string; toProgramId: string; from: string; to: string; bonusPercent: number; url: string; startsAt: string; endsAt: string; active: boolean };

export function PromotionsAdmin({ items, programs }: { items: P[]; programs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<P | "new" | null>(null);
  const [erro, setErro] = useState("");
  const cur = edit && edit !== "new" ? edit : null;
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      kind: f.get("kind"), title: f.get("title"), description: f.get("description") || null, fromProgramId: f.get("from") || null, toProgramId: f.get("to") || null,
      bonusPercent: Number(f.get("bonus") || 0), url: f.get("url") || null, startsAt: f.get("startsAt"), endsAt: f.get("endsAt"), active: f.get("active") === "on",
    };
    const r = cur ? await api(`/api/admin/promotions/${cur.id}`, "PATCH", body) : await api("/api/admin/promotions", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setEdit(null);
    toast(cur ? "Promoção atualizada" : "Promoção criada");
    refreshSafe(router);
  }
  async function remove(p: P) {
    if (!(await confirmDialog({ title: "Excluir promoção?", body: p.title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/admin/promotions/${p.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Promoção excluída");
    refreshSafe(router);
  }
  const now = today();
  return (
    <>
      <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => { setErro(""); setEdit("new"); }}><Plus className="h-4 w-4" />Nova promoção</button></div>
      <div className="card overflow-hidden">
        <table className="table-base">
          <thead><tr><th>Promoção</th><th className="hidden md:table-cell">Programas</th><th className="text-right">Bônus</th><th className="hidden sm:table-cell">Período</th><th>Status</th><th className="w-24"><span className="sr-only">Ações</span></th></tr></thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id}>
                <td className="max-w-[260px]"><span className="block truncate font-semibold">{p.title}</span><span className="text-xs text-muted">{KINDS.find(([k]) => k === p.kind)?.[1]}</span></td>
                <td className="hidden text-muted md:table-cell">{[p.from, p.to].filter(Boolean).join(" → ") || "-"}</td>
                <td className="text-right tabular-nums">{p.bonusPercent ? `${p.bonusPercent}%` : "-"}</td>
                <td className="hidden whitespace-nowrap text-muted sm:table-cell">{fmtDate(p.startsAt)} a {fmtDate(p.endsAt)}</td>
                <td>{!p.active ? <span className="text-muted">Inativa</span> : p.endsAt < now ? <span className="text-muted">Encerrada</span> : <span className="text-ok">Ativa</span>}</td>
                <td className="whitespace-nowrap text-right">
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => { setErro(""); setEdit(p); }} aria-label={`Editar ${p.title}`}><Pencil className="h-4 w-4" /></button>
                  <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(p)} aria-label={`Excluir ${p.title}`}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted">Nenhuma promoção cadastrada.</td></tr>}
          </tbody>
        </table>
      </div>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={cur ? "Editar promoção" : "Nova promoção"} footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button form="promo-form" className="btn-primary">Salvar</button></>}>
        <form id="promo-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" key={cur?.id ?? "new"}>
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          <Field label="Título" required className="sm:col-span-2"><input className="input" name="title" required minLength={3} maxLength={140} defaultValue={cur?.title} /></Field>
          <Field label="Tipo" required><select className="input" name="kind" defaultValue={cur?.kind ?? "TRANSFER_BONUS"}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Bônus (%)"><input className="input" name="bonus" type="number" min={0} max={300} defaultValue={cur?.bonusPercent ?? 0} /></Field>
          <Field label="Programa de origem"><select className="input" name="from" defaultValue={cur?.fromProgramId ?? ""}><option value="">—</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Programa de destino"><select className="input" name="to" defaultValue={cur?.toProgramId ?? ""}><option value="">—</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Início" required><input className="input" type="date" name="startsAt" required defaultValue={cur?.startsAt ?? now} /></Field>
          <Field label="Fim" required><input className="input" type="date" name="endsAt" required defaultValue={cur?.endsAt} /></Field>
          <Field label="Link das regras" className="sm:col-span-2"><input className="input" name="url" type="url" placeholder="https://" defaultValue={cur?.url} /></Field>
          <Field label="Descrição" className="sm:col-span-2"><textarea className="input min-h-[90px] py-2" name="description" maxLength={1000} defaultValue={cur?.description} /></Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={cur?.active ?? true} /> Ativa</label>
        </form>
      </Modal>
    </>
  );
}
