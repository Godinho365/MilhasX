"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useState } from "react";
import { Plus, Trash2, UserPlus, WalletCards, FileText, MoreHorizontal, Eye, Pencil, Pin, PinOff, Archive, ArchiveRestore, Search, Filter, CreditCard } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { Switch } from "@/components/form-parts";
import { TagsInput } from "../purchases/purchases";
import { api } from "@/lib/api";
import { fmtBRL, fmtPts } from "@/lib/format";
import { Avatar } from "@/components/stat";
import { ProgramLogo } from "@/components/program-logo";
import { Modal, Field, Alert, Empty, SegmentedButtons } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { HoldersTab, HolderDialog, type HolderFull } from "./holders";

type Acc = { cards?: string[]; cpf?: { used: number; limit: number | null } | null; id: string; holderId: string; holderName: string; programId: string; programName: string; programColor: string; programLogo?: string | null; balance: number; cpmCents: number | null; costCents: number; pendingPoints: number; nickname: string | null; label: string; pinned: boolean; archived: boolean; tags: string[]; cpfAvailable: number | null; transferBonusPct?: number | null; updatedAt: string };
type P = { id: string; name: string; balance: number; costCents: number; cpmCents: number | null; color: string; logo?: string | null; holders: number };

export function ProgramsClient(props: { view: "programas" | "titulares"; holders: HolderFull[]; programs: { id: string; name: string; color: string }[]; accounts: Acc[]; byProgram: P[] }) {
  const router = useRouter();
  const [group, setGroup] = useState<"holder" | "program">("holder");
  const [holderModal, setHolderModal] = useState(false);
  const [accModal, setAccModal] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [filters, setFilters] = useState(false);
  const [menu, setMenu] = useState<{ a: Acc; top: number; right: number } | null>(null);
  const [editing, setEditing] = useState<Acc | null>(null);
  const allTags = [...new Set(props.accounts.flatMap((a) => a.tags))].sort();
  const term = q.trim().toLowerCase();
  const shown = props.accounts.filter((a) => (showArchived || !a.archived) && (!term || `${a.label} ${a.programName} ${a.holderName}`.toLowerCase().includes(term)) && tagFilter.every((t) => a.tags.includes(t)));

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);

  async function run(p: Promise<{ ok: boolean; erro?: string }>, msg: string, after?: () => void) {
    const r = await p;
    if (!r.ok) {
      setErro((r as { erro: string }).erro);
      return toast((r as { erro: string }).erro, "error");
    }
    setErro("");
    toast(msg);
    after?.();
    refreshSafe(router);
  }
  async function delAccount(a: Acc) {
    if (await confirmDialog({ title: `Excluir conta ${a.programName}?`, body: `Titular: ${a.holderName}. Só é possível excluir contas sem lançamentos.`, confirmLabel: "Excluir", danger: true }))
      run(api(`/api/accounts/${a.id}`, "DELETE"), "Conta excluída");
  }

  useEffect(() => {
    const open = () => setHolderModal(true);
    window.addEventListener("mm:new-holder", open);
    return () => window.removeEventListener("mm:new-holder", open);
  }, []);

  const actions = (
    <div className="flex gap-2">
      <button className="btn-ghost" onClick={() => setHolderModal(true)}><UserPlus className="h-4 w-4" />Titular</button>
      <button className="btn-primary" onClick={() => setAccModal(props.holders[0]?.id ?? "")} disabled={props.holders.length === 0}><Plus className="h-4 w-4" />Conta</button>
    </div>
  );

  return (
    <>
      {props.view === "programas" ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SegmentedButtons items={[{ key: "holder", label: "Por titular" }, { key: "program", label: "Por programa" }]} value={group} onChange={setGroup} />
            <div className="relative min-w-0 flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" placeholder="Buscar conta" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar conta" />
            </div>
            <button type="button" className="btn-ghost btn-icon relative" onClick={() => setFilters(true)} aria-label="Mais filtros" title="Mais filtros">
              <Filter className="h-4 w-4" />
              {(showArchived ? 1 : 0) + tagFilter.length > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-light px-1 text-[10px] font-bold text-zinc-950">{(showArchived ? 1 : 0) + tagFilter.length}</span>}
            </button>
            <div className="sm:ml-auto">{actions}</div>
          </div>
          {props.accounts.length === 0 ? (
            <Empty title="Nenhuma conta cadastrada" icon={<WalletCards className="h-5 w-5" />}>
              <p className="max-w-sm text-sm text-muted">Cadastre um titular e adicione as contas dele em cada programa.</p>
              {actions}
            </Empty>
          ) : group === "program" ? (
            <div className="card overflow-hidden">
              <table className="table-base">
                <thead><tr><th>Programa</th><th className="text-right">Saldo</th><th className="text-right">CPM</th><th className="hidden text-right sm:table-cell">Custo</th><th className="hidden text-right sm:table-cell">Contas</th></tr></thead>
                <tbody>
                  {props.byProgram.map((p) => (
                    <tr key={p.id}>
                      <td><Link href={`/app/entries?programId=${p.id}`} className="flex items-center gap-2 font-semibold hover:underline"><ProgramLogo programId={p.id} name={p.name} color={p.color} version={p.logo} size={28} />{p.name}</Link></td>
                      <td className="text-right tabular-nums">{fmtPts(p.balance)}</td>
                      <td className="text-right tabular-nums">{fmtBRL(p.cpmCents)}</td>
                      <td className="hidden text-right tabular-nums text-muted sm:table-cell">{fmtBRL(p.costCents)}</td>
                      <td className="hidden text-right tabular-nums text-muted sm:table-cell">{p.holders}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="space-y-4">
              {props.holders.map((h) => {
                const accs = shown.filter((a) => a.holderId === h.id);
                if (accs.length === 0) return null;
                return (
                  <section key={h.id} className="card overflow-hidden">
                    <div className="flex items-center gap-3 border-b border-line px-4 py-3">
                      <Avatar name={h.name} />
                      <span className="font-semibold">{h.name}</span>
                      <span className="text-sm text-muted">{accs.length} {accs.length === 1 ? "conta" : "contas"} · {fmtPts(accs.reduce((s, a) => s + a.balance, 0))} pts</span>
                    </div>
                    <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead><tr><th>Programa</th><th className="text-right">Saldo</th><th className="text-right">CPM</th><th className="hidden text-right sm:table-cell">CPFs</th><th className="hidden md:table-cell">Atualizado</th><th className="w-24 text-right">Ações</th></tr></thead>
                      <tbody>
                        {accs.map((a) => (
                          <tr key={a.id} className={a.archived ? "opacity-60" : ""}>
                            <td>
                              <span className="flex items-center gap-2">
                                <Link href={`/app/programs/${a.id}`} className="flex min-w-0 items-center gap-2 font-medium hover:underline"><ProgramLogo programId={a.programId} name={a.programName} color={a.programColor} version={a.programLogo} size={24} /><span className="truncate">{a.nickname ?? a.programName}</span></Link>
                                {!!a.cards?.length && <Link href="/app/credit-cards?tab=cartoes" className="flex shrink-0 items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-medium text-accent-light" title={`Cartão: ${a.cards.join(", ")}`} aria-label={`Cartão cadastrado: ${a.cards.join(", ")}`}><CreditCard className="h-3 w-3" />{a.cards.length > 1 ? a.cards.length : ""}</Link>}
                                {a.archived && <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">Arquivada</span>}
                                {a.tags.map((t) => <span key={t} className="hidden rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-zinc-300 lg:inline">{t}</span>)}
                              </span>
                              {a.pendingPoints > 0 && <span className="block text-xs text-amber-300">+{fmtPts(a.pendingPoints)} a receber</span>}
                            </td>
                            <td className="text-right tabular-nums">{fmtPts(a.balance)}</td>
                            <td className="text-right tabular-nums">{a.cpmCents != null ? fmtBRL(a.cpmCents) : "-"}</td>
                            <td className="hidden text-right tabular-nums sm:table-cell" title={a.cpf ? "CPFs usados / limite do programa" : undefined}>{a.cpf ? <span className={a.cpf.limit != null && a.cpf.used >= a.cpf.limit ? "text-red-300" : ""}>{a.cpf.used} / {a.cpf.limit}</span> : a.cpfAvailable ?? "-"}</td>
                            <td className="hidden text-muted md:table-cell">{fmtDate(a.updatedAt)}</td>
                            <td className="whitespace-nowrap text-right">
                              <button className={`btn-subtle h-8 w-8 px-0 ${a.pinned ? "text-accent-light" : ""}`} onClick={() => run(api(`/api/accounts/${a.id}`, "PATCH", { pinned: !a.pinned }), a.pinned ? "Conta tirada da barra lateral" : "Conta fixada na barra lateral")} aria-pressed={a.pinned} aria-label={a.pinned ? `Desafixar ${a.label} da barra lateral` : `Fixar ${a.label} na barra lateral`} title={a.pinned ? "Desafixar da barra lateral" : "Fixar na barra lateral"} disabled={a.archived}>
                                {a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                              </button>
                              <button className="btn-subtle h-8 w-8 px-0" aria-label={`Ações da conta ${a.label}`} aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.a.id === a.id ? null : { a, top: Math.min(r.bottom + 4, window.innerHeight - 230), right: window.innerWidth - r.right }); }}><MoreHorizontal className="h-4 w-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <HoldersTab holders={props.holders} accounts={props.accounts} onNew={() => setHolderModal(true)} onAddAccount={(id) => setAccModal(id)} />
        </>
      )}

      {menu && (
        <div role="menu" style={{ top: menu.top, right: menu.right }} className="fixed z-50 w-60 rounded-xl border border-line bg-panel2 p-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <Link role="menuitem" href={`/app/programs/${menu.a.id}`} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line"><Eye className="h-4 w-4" />Ver detalhes</Link>
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setEditing(menu.a); setMenu(null); }}><Pencil className="h-4 w-4" />Editar</button>
          {!menu.a.archived && <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { const a = menu.a; setMenu(null); run(api(`/api/accounts/${a.id}`, "PATCH", { pinned: !a.pinned }), a.pinned ? "Conta tirada da barra lateral" : "Conta fixada na barra lateral"); }}>{menu.a.pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}{menu.a.pinned ? "Desafixar da barra lateral" : "Fixar na barra lateral"}</button>}
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { const a = menu.a; setMenu(null); run(api(`/api/accounts/${a.id}`, "PATCH", { archived: !a.archived }), a.archived ? "Conta desarquivada" : "Conta arquivada"); }}>{menu.a.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}{menu.a.archived ? "Desarquivar" : "Arquivar"}</button>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-line" onClick={() => { const a = menu.a; setMenu(null); delAccount(a); }}><Trash2 className="h-4 w-4" />Excluir</button>
        </div>
      )}
      {filters && (
        <Modal open onClose={() => setFilters(false)} size="sm" title="Filtros" footer={<><button className="btn-ghost mr-auto" onClick={() => { setShowArchived(false); setTagFilter([]); }}>Limpar</button><button className="btn-primary" onClick={() => setFilters(false)}>Fechar</button></>}>
          <div className="space-y-4">
            <div><p className="label">Visibilidade</p><Switch checked={showArchived} onChange={setShowArchived} label="Mostrar contas arquivadas" /></div>
            <div>
              <p className="label">Tags</p>
              {allTags.length === 0 ? <p className="text-sm text-muted">Nenhuma tag criada</p> : (
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((t) => <button key={t} type="button" aria-pressed={tagFilter.includes(t)} onClick={() => setTagFilter(tagFilter.includes(t) ? tagFilter.filter((x) => x !== t) : [...tagFilter, t])} className={`rounded-full border px-2.5 py-1 text-xs ${tagFilter.includes(t) ? "border-accent-light bg-accent-soft/40 text-accent-light" : "border-line text-zinc-300"}`}>{t}</button>)}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      {editing && <AccountDialog account={editing} tagSuggestions={allTags} onClose={() => setEditing(null)} />}
      {holderModal && <HolderDialog holder={null} onClose={() => setHolderModal(false)} />}
      <Modal open={accModal !== null} onClose={() => setAccModal(null)} title="Nova conta" size="sm" footer={<><button className="btn-ghost" onClick={() => setAccModal(null)}>Cancelar</button><button form="acc-form" className="btn-primary">Adicionar</button></>}>
        <form id="acc-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); run(api("/api/accounts", "POST", { holderId: f.get("holderId"), programId: f.get("programId") }), "Conta adicionada", () => setAccModal(null)); }}>
          {erro && <Alert>{erro}</Alert>}
          <Field label="Titular" required>
            <select className="input" name="holderId" defaultValue={accModal ?? ""} required>{props.holders.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</select>
          </Field>
          <Field label="Programa" required>
            <select className="input" name="programId" required defaultValue="">
              <option value="" disabled>Selecione</option>
              {props.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <p className="flex items-center gap-2 text-xs text-muted"><FileText className="h-3.5 w-3.5" />Depois registre o saldo inicial pelo botão “Novo lançamento”.</p>
        </form>
      </Modal>
    </>
  );
}

/** Editar conta: nome, CPFs disponíveis e tags. */
function AccountDialog({ account, tagSuggestions, onClose }: { account: Acc; tagSuggestions: string[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ nickname: account.nickname ?? "", cpf: account.cpfAvailable != null ? String(account.cpfAvailable) : "", bonus: account.transferBonusPct != null ? String(account.transferBonusPct) : "" });
  const [tags, setTags] = useState(account.tags);
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/accounts/${account.id}`, "PATCH", { nickname: f.nickname || null, cpfAvailable: f.cpf.trim() ? Number(f.cpf) : null, transferBonusPct: f.bonus.trim() ? Number(f.bonus) : null, tags });
    if (!r.ok) return setErro(r.erro);
    toast("Conta atualizada");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Editar conta" footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="account-form" className="btn-primary">Salvar alterações</button></>}>
      <form id="account-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">{account.programName} · {account.holderName}</p>
        <Field label="Nome da conta" hint={`Em branco: ${account.programName} ${account.holderName}`}><input className="input" maxLength={60} value={f.nickname} onChange={(e) => setF({ ...f, nickname: e.target.value })} placeholder={`${account.programName} ${account.holderName}`} /></Field>
        <Field label="CPFs disponíveis" hint="Quantos passageiros ainda podem ser emitidos nessa conta"><input className="input" type="number" min={0} max={1000} value={f.cpf} onChange={(e) => setF({ ...f, cpf: e.target.value })} placeholder="Ex: 25" /></Field>
        <Field label="Bônus em transferências (%)" hint="Bônus que esta conta recebe enquanto o clube está ativo (ex.: 30). Preenche sozinho na transferência."><input className="input" type="number" min={0} max={300} value={f.bonus} onChange={(e) => setF({ ...f, bonus: e.target.value })} placeholder="Ex: 30" /></Field>
        <Field label="Tags"><TagsInput value={tags} onChange={setTags} suggestions={tagSuggestions} /></Field>
      </form>
    </Modal>
  );
}
