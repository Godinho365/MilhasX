"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, UserRound, Info } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { Modal, Field, Alert } from "@/components/ui";
import { Stat } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";

export type Member = { id: string; name: string; role: string | null; email: string | null; phone: string | null; color: string; active: boolean; openTasks: number };
const COLORS = ["#60a5fa", "#22c55e", "#a78bfa", "#f59e0b", "#ef4444", "#f472b6", "#38bdf8", "#94a3b8"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

export function MembersClient({ members, owner }: { members: Member[]; owner: { name: string; email: string } }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  async function remove(m: Member) {
    if (!(await confirmDialog({ title: `Tirar ${m.name} da equipe?`, body: "As tarefas e metas dele ficam sem responsável.", confirmLabel: "Tirar", danger: true }))) return;
    const r = await api(`/api/team/members/${m.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Membro removido");
    refreshSafe(router);
  }
  const active = members.filter((m) => m.active);
  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Membros" value={String(members.length + 1)} hint="com você" />
        <Stat label="Ativos" value={String(active.length + 1)} />
        <Stat label="Tarefas abertas" value={String(members.reduce((t, m) => t + m.openTasks, 0))} hint="com responsável" />
        <Stat label="Acesso ao app" value="Só você" hint="login de membros: em breve" />
      </div>
      <p className="mb-3 flex items-start gap-2 rounded-xl border border-line bg-panel2/50 px-4 py-3 text-sm text-muted"><Info className="mt-0.5 h-4 w-4 shrink-0" />Por enquanto os membros servem para dividir as <Link href="/app/equipe/tarefas" className="text-accent-light hover:underline">tarefas</Link> e as <Link href="/app/equipe/metas" className="text-accent-light hover:underline">metas</Link>. O convite para cada um entrar com o próprio login e permissões por tela vem numa próxima etapa.</p>
      <section className="card overflow-hidden" aria-label="Membros">
        <div className="flex items-center gap-2 border-b border-line px-5 py-3">
          <h2 className="flex-1 font-semibold">Membros</h2>
          <button className="btn-primary h-9" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Novo membro</button>
        </div>
        <ul className="divide-y divide-line">
          <li className="flex items-center gap-3 px-5 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-light">{initials(owner.name)}</span>
            <div className="min-w-0 flex-1"><p className="font-semibold">{owner.name}</p><p className="text-xs text-muted">{owner.email}</p></div>
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-light">Dono da conta</span>
          </li>
          {members.map((m) => (
            <li key={m.id} className={`flex items-center gap-3 px-5 py-3 ${m.active ? "" : "opacity-50"}`}>
              <span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-zinc-950" style={{ backgroundColor: m.color }}>{initials(m.name)}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{m.name}{m.role && <span className="font-normal text-muted"> · {m.role}</span>}</p>
                <p className="truncate text-xs text-muted">{[m.email, m.phone].filter(Boolean).join(" · ") || "sem contato"}</p>
              </div>
              <Link href={`/app/equipe/tarefas?membro=${m.id}`} className="text-xs text-muted hover:text-white">{m.openTasks} {m.openTasks === 1 ? "tarefa aberta" : "tarefas abertas"}</Link>
              {!m.active && <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">Inativo</span>}
              <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(m)} aria-label={`Editar ${m.name}`}><Pencil className="h-4 w-4" /></button>
              <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(m)} aria-label={`Tirar ${m.name} da equipe`}><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      </section>
      {editing && <MemberDialog m={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function MemberDialog({ m, onClose }: { m: Member | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: m?.name ?? "", role: m?.role ?? "", email: m?.email ?? "", phone: m?.phone ?? "", color: m?.color ?? COLORS[0]!, active: m?.active ?? true });
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = { ...f, role: f.role || null, email: f.email || null, phone: f.phone || null };
    const r = m ? await api(`/api/team/members/${m.id}`, "PUT", body) : await api("/api/team/members", "POST", body);
    if (!r.ok) return setErro(r.erro);
    toast(m ? "Membro atualizado" : "Membro adicionado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={m ? "Editar membro" : "Novo membro"} size="sm" icon={<UserRound className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="mem-form" className="btn-primary">Salvar</button></>}>
      <form id="mem-form" onSubmit={save} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required aria-label="Nome" autoFocus /></Field>
        <Field label="Cargo"><input className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} maxLength={80} placeholder="Ex.: Emissor, Atendimento" aria-label="Cargo" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} aria-label="E-mail" /></Field>
        <Field label="Telefone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} aria-label="Telefone" /></Field>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor">{COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Cor ${c}`} aria-pressed={f.color === c} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-panel ${f.color === c ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: c }} />)}</div>
        {m && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Ativo</label>}
      </form>
    </Modal>
  );
}
