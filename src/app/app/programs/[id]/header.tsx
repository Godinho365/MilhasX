"use client";
// Cabeçalho da conta como na referência: conta ativa, nome, programa e as ações (editar, contato, organizar, excluir).
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Phone, SlidersHorizontal, Trash2, Pin, PinOff, Tags } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { toast, confirmDialog } from "@/components/feedback";
import { ProgramLogo } from "@/components/program-logo";
import { AccountDialog, type EditableAccount } from "../client";

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
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(false); };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); window.removeEventListener("keydown", esc); };
  }, [menu]);

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
  const btn = "btn-ghost h-9 border border-line bg-panel";
  return (
    <section className="mb-4 flex flex-wrap items-center gap-4 rounded-2xl border border-line p-5" style={{ backgroundColor: `${program.color}14` }} aria-label="Conta">
      <ProgramLogo programId={program.id} name={a.programName} color={program.color} version={program.logo} size={48} />
      <div className="min-w-0 flex-1">
        <div className="mb-1 inline-flex items-center gap-2 text-xs text-muted">
          <button type="button" role="switch" aria-checked={!a.archived} aria-label="Conta ativa" onClick={() => patch({ archived: !a.archived }, a.archived ? "Conta ativada" : "Conta desativada (arquivada)")}
            className={`relative h-5 w-9 rounded-full transition-colors ${a.archived ? "bg-panel2" : "bg-accent"}`}>
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${a.archived ? "left-0.5" : "left-[18px]"}`} />
          </button>
          {a.archived ? "Conta inativa" : "Conta ativa"}
        </div>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        <span className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold text-white" style={{ backgroundColor: program.color }}>{program.code} · {a.programName}</span>
      </div>
      <div className="grid grid-cols-[auto_auto] gap-2">
        <button type="button" className={btn} onClick={() => setEditing(true)}><Pencil className="h-4 w-4" />Editar</button>
        {phone
          ? <a className={`${btn} w-9 px-0`} href={whatsapp(phone)} target="_blank" rel="noreferrer" aria-label={`WhatsApp de ${a.holderName}`} title={`WhatsApp de ${a.holderName}: ${phone}`}><Phone className="h-4 w-4" /></a>
          : <button type="button" className={`${btn} w-9 px-0 opacity-50`} disabled aria-label="Titular sem telefone" title="Cadastre o telefone/WhatsApp no titular para falar com ele daqui"><Phone className="h-4 w-4" /></button>}
        <div ref={menuRef} className="relative col-span-2">
          <button type="button" className={`${btn} w-full`} aria-expanded={menu} aria-haspopup="menu" onClick={() => setMenu((m) => !m)}><SlidersHorizontal className="h-4 w-4" />Organizar</button>
          {menu && (
            <div role="menu" className="absolute right-0 top-full z-40 mt-1 w-56 rounded-xl border border-line bg-panel2 p-1 shadow-xl">
              <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setMenu(false); patch({ pinned: !a.pinned }, a.pinned ? "Tirada da barra lateral" : "Fixada na barra lateral"); }}>{a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}{a.pinned ? "Tirar da barra lateral" : "Fixar na barra lateral"}</button>
              <button role="menuitem" type="button" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setMenu(false); setEditing(true); }}><Tags className="h-4 w-4" />Nome e tags</button>
            </div>
          )}
        </div>
        <button type="button" className={`${btn} col-span-2 text-red-300`} onClick={remove}><Trash2 className="h-4 w-4" />Excluir conta</button>
      </div>
      {editing && <AccountDialog account={a} tagSuggestions={[]} onClose={() => setEditing(false)} />}
    </section>
  );
}
