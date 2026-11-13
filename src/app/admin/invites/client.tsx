"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";
import { Field, Modal, SegmentedButtons } from "@/components/ui";

export type InviteDraft = { id?: string; code: string; kind: "PLAN" | "TRIAL"; plan: "PRO" | "GESTOR" | null; interval: "MENSAL" | "ANUAL" | null; days: number | null; maxUses: number | null; expiresAt: string | null; note: string | null };
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32]).join("");

export function InviteForm({ initial }: { initial?: InviteDraft }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const fresh = (): InviteDraft => ({ code: randomCode(), kind: "TRIAL", plan: "GESTOR", interval: "MENSAL", days: 30, maxUses: 1, expiresAt: null, note: null });
  const [d, setD] = useState<InviteDraft>(initial ?? fresh());
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<InviteDraft>) => setD((x) => ({ ...x, ...p }));

  async function save() {
    setBusy(true);
    const body = { ...d, id: undefined, plan: d.kind === "PLAN" ? d.plan : null, interval: d.kind === "PLAN" ? d.interval : null, days: d.kind === "TRIAL" ? d.days : null, note: d.note || null };
    const r = await api(d.id ? `/api/admin/invites/${d.id}` : "/api/admin/invites", d.id ? "PUT" : "POST", body);
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast(d.id ? "Convite atualizado" : "Convite criado. Copie o link para enviar.");
    setOpen(false);
    if (!d.id) setD(fresh());
    refreshSafe(router);
  }

  return (
    <>
      {initial ? <button className="btn-icon h-8 w-8" onClick={() => setOpen(true)} aria-label={`Editar ${initial.code}`}><Pencil className="h-4 w-4" /></button>
        : <button className="btn-primary h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Novo convite</button>}
      <Modal open={open} onClose={() => setOpen(false)} title={d.id ? `Editar ${d.code}` : "Novo convite"}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy || d.code.trim().length < 3}>{busy ? "Salvando…" : "Salvar"}</button></>}>
        <div className="space-y-4">
          <Field label="O convite dá">
            <SegmentedButtons items={[{ key: "TRIAL", label: "Dias de teste" }, { key: "PLAN", label: "Plano de cortesia" }]} value={d.kind} onChange={(k) => set({ kind: k as InviteDraft["kind"] })} />
          </Field>
          {d.kind === "TRIAL" ? (
            <Field label="Dias de teste do Gestor" hint="Somam ao teste em curso, se houver"><input className="input" type="number" min={1} max={365} value={d.days ?? ""} onChange={(e) => set({ days: e.target.value ? Math.round(Number(e.target.value)) : null })} /></Field>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Plano"><select className="input" value={d.plan ?? "GESTOR"} onChange={(e) => set({ plan: e.target.value as "PRO" | "GESTOR" })}><option value="PRO">PRO</option><option value="GESTOR">Gestor</option></select></Field>
              <Field label="Como"><select className="input" value={d.interval ?? "MENSAL"} onChange={(e) => set({ interval: e.target.value as "MENSAL" | "ANUAL" })}><option value="MENSAL">Mensal</option><option value="ANUAL">Anual</option></select></Field>
              <p className="text-xs text-muted sm:col-span-2">O plano fica ativo sem cobrança até a administração mudar. Não entra no MRR.</p>
            </div>
          )}
          <Field label="Código do link" hint="Vira /convite/CODIGO" required>
            <input className="input uppercase" value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} maxLength={30} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Limite de usos" hint="Vazio = sem limite"><input className="input" type="number" min={1} value={d.maxUses ?? ""} onChange={(e) => set({ maxUses: e.target.value ? Math.round(Number(e.target.value)) : null })} /></Field>
            <Field label="Válido até" hint="Vazio = sem validade"><input className="input" type="date" value={d.expiresAt ?? ""} onChange={(e) => set({ expiresAt: e.target.value || null })} /></Field>
          </div>
          <Field label="Para quem / anotação"><input className="input" value={d.note ?? ""} onChange={(e) => set({ note: e.target.value })} maxLength={200} placeholder="Ex.: parceiro da agência X" /></Field>
        </div>
      </Modal>
    </>
  );
}
