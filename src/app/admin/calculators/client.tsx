"use client";
// Dados das calculadoras: parcerias de transferência (rotas) e catálogo de clubes (simulador de assinatura).
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type Program = { id: string; name: string };
export type PartnerRow = { id: string; fromProgramId: string; toProgramId: string; from: string; to: string; fromUnits: number; toUnits: number; active: boolean };
export type ClubRow = { id: string; programId: string; program: string; name: string; modality: string; miles: number; monthlyCents: number; signupBonus: number; active: boolean };

const ratio = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const num = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(/\./g, "").replace(",", ".")) || 0;
const dec = (v: FormDataEntryValue | null) => Number(String(v ?? "").replace(",", ".")) || 0;

export function CalculatorsAdmin({ programs, partners, clubs }: { programs: Program[]; partners: PartnerRow[]; clubs: ClubRow[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ type: "partner"; row: PartnerRow | null } | { type: "club"; row: ClubRow | null } | null>(null);
  const [erro, setErro] = useState("");

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    const f = new FormData(e.currentTarget);
    const body = edit.type === "partner"
      ? { fromProgramId: f.get("from"), toProgramId: f.get("to"), fromUnits: dec(f.get("fromUnits")), toUnits: dec(f.get("toUnits")), active: f.get("active") === "on" }
      : { programId: f.get("program"), name: f.get("name"), modality: f.get("modality") || "Mensal", miles: num(f.get("miles")), monthlyCents: parseBRLToCents(String(f.get("monthly") || "0")) ?? 0, signupBonus: num(f.get("signup")), active: f.get("active") === "on" };
    const r = edit.row
      ? await api(`/api/admin/calculators/${edit.type}/${edit.row.id}`, "PATCH", body)
      : await api("/api/admin/calculators", "POST", { type: edit.type, ...body });
    if (!r.ok) return setErro(r.erro);
    toast(edit.type === "partner" ? "Parceria salva" : "Plano salvo");
    setEdit(null);
    refreshSafe(router);
  }
  async function remove(type: "partner" | "club", id: string, label: string) {
    if (!(await confirmDialog({ title: type === "partner" ? "Excluir parceria?" : "Excluir plano?", body: label, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/admin/calculators/${type}/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Excluído");
    refreshSafe(router);
  }
  const open = (x: NonNullable<typeof edit>) => { setErro(""); setEdit(x); };
  const actions = (onEdit: () => void, onDelete: () => void, label: string) => (
    <td className="whitespace-nowrap text-right">
      <button className="btn-subtle h-8 w-8 px-0" onClick={onEdit} aria-label={`Editar ${label}`}><Pencil className="h-4 w-4" /></button>
      <button className="btn-subtle h-8 w-8 px-0" onClick={onDelete} aria-label={`Excluir ${label}`}><Trash2 className="h-4 w-4" /></button>
    </td>
  );
  const p = edit?.type === "partner" ? edit.row : null;
  const c = edit?.type === "club" ? edit.row : null;

  return (
    <>
      <section className="mb-6" aria-label="Parcerias de transferência">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex-1"><h2 className="text-lg font-semibold">Parcerias de transferência</h2><p className="text-sm text-muted">Usadas na calculadora de rotas. Paridade origem : destino (ex.: 1 : 1, 3 : 1, 1 : 5,5). Confira a paridade vigente no site de cada programa.</p></div>
          <button className="btn-primary" onClick={() => open({ type: "partner", row: null })}><Plus className="h-4 w-4" />Nova parceria</button>
        </div>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Origem</th><th>Destino</th><th className="text-right">Paridade</th><th>Status</th><th className="w-24"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {partners.map((x) => (
                <tr key={x.id}>
                  <td className="font-medium">{x.from}</td><td>{x.to}</td>
                  <td className="text-right tabular-nums">{ratio(x.fromUnits)} : {ratio(x.toUnits)}</td>
                  <td>{x.active ? <span className="text-ok">Ativa</span> : <span className="text-muted">Inativa</span>}</td>
                  {actions(() => open({ type: "partner", row: x }), () => remove("partner", x.id, `${x.from} → ${x.to}`), `${x.from} → ${x.to}`)}
                </tr>
              ))}
              {partners.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">Nenhuma parceria cadastrada.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-label="Catálogo de clubes">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex-1"><h2 className="text-lg font-semibold">Catálogo de clubes</h2><p className="text-sm text-muted">Planos que aparecem no simulador de assinatura. Mantenha milhas e mensalidade iguais às do site do programa.</p></div>
          <button className="btn-primary" onClick={() => open({ type: "club", row: null })}><Plus className="h-4 w-4" />Novo plano</button>
        </div>
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Programa</th><th>Plano</th><th className="hidden sm:table-cell">Modalidade</th><th className="text-right">Milhas/mês</th><th className="text-right">Mensalidade</th><th className="hidden text-right md:table-cell">Bônus adesão</th><th className="w-24"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {clubs.map((x) => (
                <tr key={x.id} className={x.active ? "" : "opacity-60"}>
                  <td className="font-medium">{x.program}</td><td>{x.name}</td><td className="hidden text-muted sm:table-cell">{x.modality}</td>
                  <td className="text-right tabular-nums">{fmtPts(x.miles)}</td><td className="text-right tabular-nums">{fmtBRL(x.monthlyCents)}</td>
                  <td className="hidden text-right tabular-nums md:table-cell">{x.signupBonus ? fmtPts(x.signupBonus) : "-"}</td>
                  {actions(() => open({ type: "club", row: x }), () => remove("club", x.id, `${x.program} ${x.name}`), `${x.program} ${x.name}`)}
                </tr>
              ))}
              {clubs.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted">Nenhum plano cadastrado.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.type === "partner" ? (p ? "Editar parceria" : "Nova parceria") : (c ? "Editar plano" : "Novo plano")}
        footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button form="calc-form" className="btn-primary">Salvar</button></>}>
        <form id="calc-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" key={`${edit?.type}-${p?.id ?? c?.id ?? "new"}`}>
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          {edit?.type === "partner" ? (
            <>
              <Field label="Origem" required><select className="input" name="from" required defaultValue={p?.fromProgramId ?? ""}><option value="">Selecione</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Destino" required><select className="input" name="to" required defaultValue={p?.toProgramId ?? ""}><option value="">Selecione</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Pontos na origem" required><input className="input" name="fromUnits" inputMode="decimal" required defaultValue={p ? ratio(p.fromUnits) : "1"} /></Field>
              <Field label="Viram no destino" required><input className="input" name="toUnits" inputMode="decimal" required defaultValue={p ? ratio(p.toUnits) : "1"} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={p?.active ?? true} /> Ativa</label>
            </>
          ) : (
            <>
              <Field label="Programa" required><select className="input" name="program" required defaultValue={c?.programId ?? ""}><option value="">Selecione</option>{programs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></Field>
              <Field label="Plano" required><input className="input" name="name" required minLength={2} maxLength={80} placeholder="Ex.: Clube 1.000" defaultValue={c?.name} /></Field>
              <Field label="Modalidade"><input className="input" name="modality" maxLength={40} placeholder="Mensal, Anual…" defaultValue={c?.modality ?? "Mensal"} /></Field>
              <Field label="Milhas por mês" required><input className="input" name="miles" inputMode="numeric" required defaultValue={c?.miles} /></Field>
              <Field label="Mensalidade (R$)" required><input className="input" name="monthly" inputMode="decimal" required defaultValue={c ? (c.monthlyCents / 100).toFixed(2).replace(".", ",") : ""} /></Field>
              <Field label="Bônus ao assinar"><input className="input" name="signup" inputMode="numeric" defaultValue={c?.signupBonus || ""} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={c?.active ?? true} /> Ativo</label>
            </>
          )}
        </form>
      </Modal>
    </>
  );
}
