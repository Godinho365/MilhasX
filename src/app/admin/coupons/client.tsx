"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Pencil, Plus } from "lucide-react";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { toast } from "@/components/feedback";
import { Field, Modal, SegmentedButtons } from "@/components/ui";
import { parseBRLToCents } from "@/lib/format";

export type CouponDraft = { id?: string; code: string; kind: "PERCENT" | "FIXED"; value: number; plans: string[]; intervals: string[]; maxUses: number | null; expiresAt: string | null; note: string | null };
const EMPTY: CouponDraft = { code: "", kind: "PERCENT", value: 10, plans: [], intervals: [], maxUses: null, expiresAt: null, note: null };

function Toggle({ options, value, onChange }: { options: [string, string][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([k, l]) => {
        const on = value.includes(k);
        return <button key={k} type="button" onClick={() => onChange(on ? value.filter((x) => x !== k) : [...value, k])} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-[rgb(var(--brand))] bg-[rgb(var(--brand))] text-white" : "border-line text-muted"}`}>{l}</button>;
      })}
    </div>
  );
}

export function CouponForm({ initial, label = "Novo cupom" }: { initial?: CouponDraft; label?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<CouponDraft>(initial ?? EMPTY);
  const [money, setMoney] = useState(initial?.kind === "FIXED" ? (initial.value / 100).toFixed(2).replace(".", ",") : "");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<CouponDraft>) => setD((x) => ({ ...x, ...p }));

  async function save() {
    const value = d.kind === "FIXED" ? parseBRLToCents(money) ?? 0 : d.value;
    setBusy(true);
    const r = await api(d.id ? `/api/admin/coupons/${d.id}` : "/api/admin/coupons", d.id ? "PUT" : "POST", { ...d, id: undefined, value, note: d.note || null });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast(d.id ? "Cupom atualizado" : `Cupom ${d.code.toUpperCase()} criado`);
    setOpen(false);
    if (!d.id) setD(EMPTY);
    refreshSafe(router);
  }

  return (
    <>
      {initial ? <button className="btn-icon h-8 w-8" onClick={() => setOpen(true)} aria-label={`Editar ${initial.code}`}><Pencil className="h-4 w-4" /></button>
        : <button className="btn-primary h-9" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />{label}</button>}
      <Modal open={open} onClose={() => setOpen(false)} title={d.id ? `Editar ${d.code}` : "Novo cupom"}
        footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy || d.code.trim().length < 3}>{busy ? "Salvando…" : "Salvar"}</button></>}>
        <div className="space-y-4">
          <Field label="Código" hint="O cliente digita na tela de assinatura. Letras, números e hífen." required>
            <input className="input uppercase" value={d.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} maxLength={30} placeholder="BEMVINDO10" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tipo de desconto">
              <SegmentedButtons items={[{ key: "PERCENT", label: "%" }, { key: "FIXED", label: "R$" }]} value={d.kind} onChange={(k) => set({ kind: k as CouponDraft["kind"] })} />
            </Field>
            {d.kind === "PERCENT"
              ? <Field label="Percentual" hint="Em cada cobrança"><input className="input" type="number" min={1} max={100} value={d.value} onChange={(e) => set({ value: Math.round(Number(e.target.value)) })} /></Field>
              : <Field label="Valor (R$)" hint="Desconto em cada cobrança"><input className="input" inputMode="decimal" value={money} onChange={(e) => setMoney(e.target.value)} placeholder="10,00" /></Field>}
          </div>
          <Field label="Planos" hint="Nenhum marcado = vale para todos"><Toggle options={[["PRO", "PRO"], ["GESTOR", "Gestor"]]} value={d.plans} onChange={(plans) => set({ plans })} /></Field>
          <Field label="Cobrança" hint="Nenhuma marcada = mensal e anual"><Toggle options={[["MENSAL", "Mensal"], ["ANUAL", "Anual"]]} value={d.intervals} onChange={(intervals) => set({ intervals })} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Limite de usos" hint="Assinaturas pagas. Vazio = sem limite"><input className="input" type="number" min={1} value={d.maxUses ?? ""} onChange={(e) => set({ maxUses: e.target.value ? Math.round(Number(e.target.value)) : null })} /></Field>
            <Field label="Válido até" hint="Vazio = sem validade"><input className="input" type="date" value={d.expiresAt ?? ""} onChange={(e) => set({ expiresAt: e.target.value || null })} /></Field>
          </div>
          <Field label="Anotação interna"><input className="input" value={d.note ?? ""} onChange={(e) => set({ note: e.target.value })} maxLength={200} placeholder="Ex.: campanha do Instagram" /></Field>
        </div>
      </Modal>
    </>
  );
}

export function ActiveSwitch({ url, active, name }: { url: string; active: boolean; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function flip() {
    setBusy(true);
    const r = await api(url, "PATCH", { active: !active });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast(active ? `${name} pausado` : `${name} ativado`);
    refreshSafe(router);
  }
  return (
    <button role="switch" aria-checked={active} aria-label={active ? `Pausar ${name}` : `Ativar ${name}`} disabled={busy} onClick={flip}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${active ? "bg-green-500" : "bg-zinc-600"}`}>
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${active ? "translate-x-[18px]" : "translate-x-0.5"}`} />
    </button>
  );
}

export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  return (
    <button className="btn-ghost h-8 px-2.5 text-xs" onClick={async () => { await navigator.clipboard.writeText(text).catch(() => null); toast("Copiado"); }}>
      <Copy className="h-3.5 w-3.5" />{label}
    </button>
  );
}
