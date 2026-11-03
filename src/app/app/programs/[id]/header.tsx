"use client";
// Cabeçalho da conta como na referência: conta ativa, nome, programa e as ações (editar, contato, organizar, excluir).
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Phone, SlidersHorizontal, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { toast, confirmDialog } from "@/components/feedback";
import { ProgramLogo } from "@/components/program-logo";
import { AccountDialog, type EditableAccount } from "../client";
import { openOrganizer } from "./cards-grid";

type Props = {
  account: EditableAccount & { archived: boolean; pinned: boolean; holderId: string };
  title: string; program: { id: string; code: string; color: string; logo?: string };
  phone: string | null;
};

/** Link do WhatsApp com DDI do Brasil quando o número vem só com DDD. */
const whatsapp = (phone: string) => {
  const d = phone.replace(/\D/g, "");
  return `https://wa.me/${d.length <= 11 ? `55${d}` : d}`;
};

export function AccountHeader({ account: a, title, program, phone }: Props) {
  const router = useRouter();
  const nav = useNav();
  const [editing, setEditing] = useState(false);

  async function patch(body: Record<string, unknown>, ok: string) {
    const r = await api(`/api/accounts/${a.id}`, "PATCH", body);
    if (!r.ok) return toast(r.erro, "error");
    toast(ok);
    refreshSafe(router);
  }
  async function remove() {
    if (!(await confirmDialog({ title: `Excluir a conta ${a.programName}?`, body: `Titular: ${a.holderName}. Só é possível excluir contas sem lançamentos; se ela tiver histórico, desative a conta.`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/accounts/${a.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Conta excluída");
    nav("/app/programs");
    refreshSafe(router);
  }
  const btn = "btn-ghost h-8 border border-line bg-panel px-2.5 text-xs";
  return (
    <section className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-line px-4 py-3" style={{ backgroundColor: `${program.color}10` }} aria-label="Conta">
      <ProgramLogo programId={program.id} name={a.programName} color={program.color} version={program.logo} size={36} />
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-lg font-semibold leading-tight tracking-tight">{title}</h1>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span className="inline-flex items-center gap-1.5 font-medium"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: program.color }} aria-hidden />{a.programName}</span>
          <span className="inline-flex items-center gap-1.5">
            <button type="button" role="switch" aria-checked={!a.archived} aria-label="Conta ativa" onClick={() => patch({ archived: !a.archived }, a.archived ? "Conta ativada" : "Conta desativada (arquivada)")}
              className={`relative h-4 w-7 rounded-full transition-colors ${a.archived ? "bg-line" : "bg-accent"}`}>
              <span className={`absolute top-0.5 h-3 w-3 rounded-full shadow transition-all ${a.archived ? "left-0.5" : "left-[14px]"}`} style={{ backgroundColor: "#fff" }} />
            </button>
            {a.archived ? "Inativa" : "Ativa"}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={btn} onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Editar</button>
        <button type="button" className={btn} onClick={openOrganizer}><SlidersHorizontal className="h-3.5 w-3.5" />Organizar</button>
        {phone
          ? <a className={`${btn} w-8 px-0`} href={whatsapp(phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${a.holderName}`} title={`WhatsApp de ${a.holderName}: ${phone}`}><Phone className="h-3.5 w-3.5" /></a>
          : <button type="button" className={`${btn} w-8 px-0 opacity-50`} disabled aria-label="Titular sem telefone" title="Cadastre o telefone/WhatsApp no titular para falar com ele daqui"><Phone className="h-3.5 w-3.5" /></button>}
        <button type="button" className={`${btn} w-8 px-0 text-red-400`} onClick={remove} aria-label="Excluir conta" title="Excluir conta"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>
      {editing && <AccountDialog account={a} tagSuggestions={[]} onClose={() => setEditing(false)} />}
    </section>
  );
}
