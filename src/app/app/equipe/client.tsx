"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Pencil, Trash2, UserRound, Users, CircleCheck, Hourglass, Plane, KeyRound, Trophy, Handshake, Search } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { PARTNER_MODES, describePartner, type PartnerMode } from "@/domain/team";

export type Member = { id: string; name: string; role: string | null; email: string | null; phone: string | null; color: string; active: boolean; issuer: boolean; openTasks: number };
type Partner = { id: string; name: string; mode: string; value: number; notes: string | null; active: boolean; sales: number; commissionCents: number };
const COLORS = ["#60a5fa", "#22c55e", "#a78bfa", "#f59e0b", "#ef4444", "#f472b6", "#38bdf8", "#94a3b8"];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

function Card({ icon, tone, label, value }: { icon: React.ReactNode; tone: string; label: string; value: string }) {
  return (
    <div className="card card-pad">
      <p className="flex items-center gap-2 text-sm text-muted"><span className={`flex h-8 w-8 items-center justify-center rounded-lg ${tone}`}>{icon}</span>{label}</p>
      <p className="mt-3 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export function MembersClient({ members, partners, owner }: { members: Member[]; partners: Partner[]; owner: { name: string; email: string } }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Member | "new" | null>(null);
  const [partner, setPartner] = useState<Partner | "new" | null>(null);
  const [q, setQ] = useState("");
  async function remove(m: Member) {
    if (!(await confirmDialog({ title: `Tirar ${m.name} da equipe?`, body: "Ele sai das tarefas em que estava; as metas dele ficam sem responsável.", confirmLabel: "Tirar", danger: true }))) return;
    const r = await api(`/api/team/members/${m.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Membro removido");
    refreshSafe(router);
  }
  async function removePartner(p: Partner) {
    if (!(await confirmDialog({ title: `Excluir o parceiro ${p.name}?`, body: p.sales ? `As ${p.sales} vendas dele ficam sem parceiro e sem comissão.` : undefined, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/partners/${p.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Parceiro excluído");
    refreshSafe(router);
  }
  const active = members.filter((m) => m.active);
  const shownPartners = partners.filter((p) => p.name.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">Gerenciar equipe</h2><p className="text-sm text-muted">Cadastre as pessoas e o que cada uma faz</p></div>
        <Link href="/app/equipe/metas" className="btn-ghost"><Trophy className="h-4 w-4" />Metas</Link>
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Novo membro</button>
      </div>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Card icon={<Users className="h-4 w-4" />} tone="bg-panel2 text-zinc-300" label="Membros" value={String(members.length + 1)} />
        <Card icon={<CircleCheck className="h-4 w-4" />} tone="bg-emerald-500/15 text-emerald-300" label="Ativos" value={String(active.length + 1)} />
        <Card icon={<Hourglass className="h-4 w-4" />} tone="bg-amber-500/15 text-amber-300" label="Pendentes" value="0" />
        <Card icon={<Plane className="h-4 w-4" />} tone="bg-blue-500/15 text-blue-300" label="Emissores" value={String(active.filter((m) => m.issuer).length + 1)} />
        <Card icon={<KeyRound className="h-4 w-4" />} tone="bg-violet-500/15 text-violet-300" label="Com acesso ao app" value="1" />
      </div>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Nome</th><th>Título/Cargo</th><th>Acesso</th><th>Situação</th><th>Atividade</th><th className="w-24 text-right" /></tr></thead>
            <tbody>
              <tr>
                <td><span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-light">{initials(owner.name)}</span><span><span className="block font-semibold">{owner.name}</span><span className="text-xs text-muted">{owner.email}</span></span></span></td>
                <td className="text-muted">—</td>
                <td><span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-zinc-950">Dono da conta</span><span className="mt-1 block text-[11px] text-muted">todas as permissões</span></td>
                <td><span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Ativo</span></td>
                <td className="text-xs text-muted">Você</td>
                <td />
              </tr>
              {members.map((m) => (
                <tr key={m.id} className={m.active ? "" : "opacity-50"}>
                  <td><span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-bold text-zinc-950" style={{ backgroundColor: m.color }}>{initials(m.name)}</span><span><span className="block font-semibold">{m.name}</span><span className="text-xs text-muted">{[m.email, m.phone].filter(Boolean).join(" · ") || "sem contato"}</span></span></span></td>
                  <td>{m.role ?? <span className="text-muted">—</span>}{m.issuer && <span className="ml-1.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 text-[11px] text-blue-300">Emissor</span>}</td>
                  <td><span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted" title="O convite para entrar com login próprio vem numa próxima etapa">Sem login</span></td>
                  <td>{m.active ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Ativo</span> : <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">Inativo</span>}</td>
                  <td><Link href={`/app/equipe/tarefas`} className="text-xs text-muted hover:text-white">{m.openTasks} {m.openTasks === 1 ? "tarefa aberta" : "tarefas abertas"}</Link></td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(m)} aria-label={`Editar ${m.name}`}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(m)} aria-label={`Tirar ${m.name} da equipe`}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="mt-8" aria-label="Parceiros">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1"><h2 className="text-xl font-semibold">Parceiros <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs font-medium text-muted">{partners.length}</span></h2><p className="text-sm text-muted">Parceiros externos e a regra de comissão aplicada nas vendas que eles trazem</p></div>
          <label className="relative w-full sm:w-56"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar parceiro..." aria-label="Buscar parceiro" /></label>
          <button className="btn-ghost" onClick={() => setPartner("new")}><Plus className="h-4 w-4" />Novo parceiro</button>
        </div>
        {partners.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
            <Handshake className="h-8 w-8 text-muted" />
            <p className="font-semibold">Nenhum parceiro cadastrado ainda</p>
            <p className="max-w-md text-sm text-muted">Cadastre parceiros para calcular a comissão nas vendas: escolha o parceiro no menu da venda e a comissão sai do lucro sozinha.</p>
            <button className="btn-primary" onClick={() => setPartner("new")}><Plus className="h-4 w-4" />Cadastrar primeiro parceiro</button>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="table-base">
              <thead><tr><th>Parceiro</th><th>Regra</th><th className="text-right">Vendas</th><th className="text-right">Comissão total</th><th>Situação</th><th className="w-24 text-right" /></tr></thead>
              <tbody>
                {shownPartners.map((p) => (
                  <tr key={p.id} className={p.active ? "" : "opacity-50"}>
                    <td className="font-semibold">{p.name}{p.notes && <span className="block text-xs font-normal text-muted">{p.notes}</span>}</td>
                    <td>{describePartner(p.mode, p.value)}</td>
                    <td className="text-right tabular-nums">{p.sales}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtBRL(p.commissionCents)}</td>
                    <td>{p.active ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-300">Ativo</span> : <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted">Inativo</span>}</td>
                    <td className="text-right"><div className="inline-flex gap-1">
                      <button className="btn-subtle h-8 w-8 px-0" onClick={() => setPartner(p)} aria-label={`Editar ${p.name}`}><Pencil className="h-4 w-4" /></button>
                      <button className="btn-subtle h-8 w-8 px-0" onClick={() => removePartner(p)} aria-label={`Excluir ${p.name}`}><Trash2 className="h-4 w-4" /></button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="mt-4 text-xs text-muted">Por enquanto só você entra no app. O convite para cada membro entrar com login próprio e permissões por tela vem numa próxima etapa.</p>
      {editing && <MemberDialog m={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
      {partner && <PartnerDialog p={partner === "new" ? null : partner} onClose={() => setPartner(null)} />}
    </>
  );
}

function MemberDialog({ m, onClose }: { m: Member | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: m?.name ?? "", role: m?.role ?? "", email: m?.email ?? "", phone: m?.phone ?? "", color: m?.color ?? COLORS[0]!, active: m?.active ?? true, issuer: m?.issuer ?? false });
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
        <Field label="Título / cargo"><input className="input" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} maxLength={80} placeholder="Ex.: Emissor, Atendimento" aria-label="Cargo" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} maxLength={200} aria-label="E-mail" /></Field>
        <Field label="Telefone"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} maxLength={30} aria-label="Telefone" /></Field>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor">{COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Cor ${c}`} aria-pressed={f.color === c} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-panel ${f.color === c ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: c }} />)}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.checked })} />Emite passagens</label>
        {m && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />Ativo</label>}
      </form>
    </Modal>
  );
}

function PartnerDialog({ p, onClose }: { p: Partner | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: p?.name ?? "", mode: (p?.mode ?? "PROFIT_PCT") as PartnerMode, value: p ? (p.value / 100).toFixed(2).replace(".", ",").replace(/,00$/, "") : "", notes: p?.notes ?? "", active: p?.active ?? true });
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(f.value.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return setErro("Valor inválido");
    const body = { name: f.name, mode: f.mode, value: Math.round(n * 100), notes: f.notes || null, active: f.active };
    const r = p ? await api(`/api/partners/${p.id}`, "PUT", body) : await api("/api/partners", "POST", body);
    if (!r.ok) return setErro(r.erro);
    toast(p ? "Parceiro atualizado" : "Parceiro cadastrado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={p ? "Editar parceiro" : "Novo parceiro"} size="sm" icon={<Handshake className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="partner-form" className="btn-primary">{p ? "Salvar" : "Cadastrar parceiro"}</button></>}>
      <form id="partner-form" onSubmit={save} className="space-y-3">
        <p className="text-sm text-muted">A regra de comissão aplicada nas vendas com este parceiro.</p>
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={120} required aria-label="Nome do parceiro" autoFocus /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Modo"><select className="input" value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as PartnerMode })} aria-label="Modo">{Object.entries(PARTNER_MODES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label={f.mode === "FIXED" ? "Valor (R$)" : "Valor (%)"} required><input className="input" inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.mode === "FIXED" ? "50,00" : "10"} required aria-label="Valor da comissão" /></Field>
        </div>
        <Field label="Observações"><textarea className="input min-h-16" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={1000} /></Field>
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><span>Parceiro ativo<span className="block text-xs text-muted">Só parceiros ativos aparecem para escolher nas vendas.</span></span></label>
      </form>
    </Modal>
  );
}
