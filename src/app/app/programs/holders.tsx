"use client";
// Aba "Titulares": tabela com nascimento e contas, menu de ações e cadastro completo do titular.
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useState } from "react";
import { MoreHorizontal, Eye, Pencil, UserCheck, Plus, Power, Trash2, Users, FileText, Send, Link2Off as LinkIcon } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtPts } from "@/lib/format";
import { Avatar } from "@/components/stat";
import { Modal, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { HolderDialog, docLabel, type HolderFull, type Attachment } from "./holder-dialog";

export { HolderDialog, type HolderFull };

type AccountLite = { id: string; holderId: string; programName: string; balance: number };

export function HoldersTab({ holders, accounts, onNew, onAddAccount }: { holders: HolderFull[]; accounts: AccountLite[]; onNew: () => void; onAddAccount: (holderId: string) => void }) {
  const router = useRouter();
  const [menu, setMenu] = useState<{ h: HolderFull; top: number; right: number } | null>(null);
  const [editing, setEditing] = useState<HolderFull | null>(null);
  // Página do titular: link de uso único enviado ao e-mail autorizado
  async function sendAccess(h: HolderFull) {
    if (!h.accessEmail) {
      toast("Cadastre o e-mail autorizado do titular (Editar › Acesso à página do titular)", "error");
      return setEditing(h);
    }
    if (!(await confirmDialog({ title: `Enviar acesso para ${h.accessEmail}?`, body: "O titular recebe um link de uso único (válido por 24 horas) para ver os saldos e as últimas movimentações das contas dele, sem custos. Links anteriores não usados deixam de valer.", confirmLabel: "Enviar" }))) return;
    const r = await api(`/api/holders/${h.id}/access`, "POST");
    if (!r.ok) return toast(r.erro, "error");
    toast(`Acesso enviado para ${h.accessEmail}`);
  }
  async function revokeAccess(h: HolderFull) {
    if (!(await confirmDialog({ title: `Revogar acessos de ${h.name}?`, body: "Links enviados e sessões abertas da página do titular deixam de funcionar.", confirmLabel: "Revogar", danger: true }))) return;
    const r = await api(`/api/holders/${h.id}/access`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Acessos revogados");
  }
  const [viewing, setViewing] = useState<HolderFull | null>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  async function run(p: Promise<{ ok: boolean; erro?: string }>, msg: string) {
    const r = await p;
    if (!r.ok) return toast((r as { erro: string }).erro, "error");
    toast(msg);
    refreshSafe(router);
  }
  async function remove(h: HolderFull) {
    if (await confirmDialog({ title: `Excluir ${h.name}?`, body: "Só é possível excluir titulares sem lançamentos. Para guardar o histórico, prefira desativar.", confirmLabel: "Excluir", danger: true }))
      run(api(`/api/holders/${h.id}`, "DELETE"), "Titular excluído");
  }
  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button role="menuitem" className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line ${danger ? "text-red-300" : ""}`} onClick={() => { setMenu(null); onClick(); }}>{icon}{label}</button>
  );

  if (holders.length === 0) {
    return <Empty title="Nenhum titular cadastrado" icon={<Users className="h-5 w-5" />}><button className="btn-primary" onClick={onNew}>Cadastrar titular</button></Empty>;
  }
  return (
    <>
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead><tr><th>Titular</th><th>Nascimento</th><th>Programas</th><th className="w-16 text-right">Ações</th></tr></thead>
            <tbody>
              {holders.map((h) => {
                const accs = accounts.filter((a) => a.holderId === h.id);
                return (
                  <tr key={h.id} className={h.active ? "" : "opacity-60"}>
                    <td>
                      <button type="button" className="flex items-center gap-3 text-left" onClick={() => setViewing(h)}>
                        <Avatar name={h.name} />
                        <span className="font-semibold hover:underline">{h.name}</span>
                        {h.isSelf && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-xs font-medium text-accent-light">Você</span>}
                        {!h.active && <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs font-medium text-muted">Inativo</span>}
                      </button>
                    </td>
                    <td className="tabular-nums">{h.birthDate ? fmtDate(h.birthDate) : <span className="text-muted">-</span>}</td>
                    <td className="text-muted">{accs.length} {accs.length === 1 ? "conta" : "contas"}</td>
                    <td className="text-right">
                      <button
                        className="btn-subtle h-8 w-8 px-0"
                        aria-label={`Ações de ${h.name}`}
                        aria-haspopup="menu"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (menu?.h.id === h.id) return setMenu(null);
                          const r = e.currentTarget.getBoundingClientRect();
                          const height = 340;
                          setMenu({ h, top: r.bottom + height > window.innerHeight - 8 ? r.top - height - 4 : r.bottom + 4, right: window.innerWidth - r.right });
                        }}
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {menu && (
        <div role="menu" style={{ top: menu.top, right: menu.right }} className="fixed z-50 w-56 animate-pop-in rounded-xl border border-line bg-panel2 p-1 shadow-xl shadow-black/40" onClick={(e) => e.stopPropagation()}>
          {item(<Eye className="h-4 w-4" />, "Ver detalhes", () => setViewing(menu.h))}
          {item(<Pencil className="h-4 w-4" />, "Editar", () => setEditing(menu.h))}
          {item(<Plus className="h-4 w-4" />, "Adicionar conta", () => onAddAccount(menu.h.id))}
          {item(<Send className="h-4 w-4" />, "Enviar acesso ao titular", () => sendAccess(menu.h))}
          {item(<LinkIcon className="h-4 w-4" />, "Revogar acessos", () => revokeAccess(menu.h))}
          {item(<UserCheck className="h-4 w-4" />, menu.h.isSelf ? "Desmarcar como você" : "Marcar como você", () => run(api(`/api/holders/${menu.h.id}/self`, "POST", { isSelf: !menu.h.isSelf }), menu.h.isSelf ? "Marcação removida" : `${menu.h.name} marcado como você`))}
          {item(<Power className="h-4 w-4" />, menu.h.active ? "Desativar" : "Ativar", () => run(api(`/api/holders/${menu.h.id}`, "PATCH", { name: menu.h.name, active: !menu.h.active }), menu.h.active ? "Titular desativado" : "Titular ativado"))}
          <div className="my-1 border-t border-line" />
          {item(<Trash2 className="h-4 w-4" />, "Excluir", () => remove(menu.h), true)}
        </div>
      )}
      {editing && <HolderDialog holder={editing} onClose={() => setEditing(null)} />}
      {viewing && (
        <HolderDetails
          holder={viewing}
          accounts={accounts.filter((a) => a.holderId === viewing.id)}
          onClose={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null); }}
        />
      )}
    </>
  );
}

function HolderDetails({ holder: h, accounts, onClose, onEdit }: { holder: HolderFull; accounts: AccountLite[]; onClose: () => void; onEdit: () => void }) {
  const [files, setFiles] = useState<Attachment[]>([]);
  useEffect(() => {
    api<{ items: Attachment[] }>(`/api/holders/${h.id}/attachments`).then((r) => r.ok && setFiles(r.data.items));
  }, [h.id]);
  const line = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-2 text-sm"><span className="text-muted">{label}</span><span className="text-right font-medium">{value}</span></div>
  );
  return (
    <Modal open onClose={onClose} size="sm" title="Detalhes do titular" footer={<><button className="btn-ghost mr-auto" onClick={onEdit}><Pencil className="h-4 w-4" />Editar</button><button className="btn-primary" onClick={onClose}>Fechar</button></>}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar name={h.name} />
          <div>
            <p className="text-lg font-semibold">{h.name}</p>
            <p className="text-sm text-muted">{h.isSelf ? "Você · " : ""}{h.active ? "Ativo" : "Inativo"}</p>
          </div>
        </div>
        <div className="divide-y divide-line">
          {line("Nascimento", h.birthDate ? fmtDate(h.birthDate) : "-")}
          {h.documents.map((d, i) => <div key={i}>{line(docLabel(d.type), d.number)}</div>)}
          {h.accessEmail && line("E-mail autorizado", h.accessEmail)}
          {h.address && line("Endereço", h.address)}
          {h.attributes.map((a, i) => <div key={i}>{line(a.key, a.value || "-")}</div>)}
        </div>
        {files.length > 0 && (
          <div>
            <p className="kicker mb-1">Anexos ({files.length})</p>
            <ul className="divide-y divide-line">
              {files.map((a) => <li key={a.id}><a className="flex items-center gap-2 py-2 text-sm hover:underline" href={`/api/holders/${h.id}/attachments/${a.id}`}><FileText className="h-4 w-4 text-muted" />{a.name}</a></li>)}
            </ul>
          </div>
        )}
        {h.notes && <div><p className="kicker mb-1">Observações</p><p className="whitespace-pre-wrap text-sm">{h.notes}</p></div>}
        <div>
          <p className="kicker mb-1">Contas ({accounts.length})</p>
          {accounts.length === 0 ? <p className="text-sm text-muted">Nenhuma conta.</p> : (
            <ul className="divide-y divide-line">
              {accounts.map((a) => <li key={a.id} className="flex justify-between py-2 text-sm"><span>{a.programName}</span><span className="tabular-nums">{fmtPts(a.balance)} pts</span></li>)}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

