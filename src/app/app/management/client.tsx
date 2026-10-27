"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useState } from "react";
import { Contact, Plus, Trash2, Pencil, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDate, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { Avatar, ProgramDot } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";
import { PointsInput, parsePts } from "@/components/form-parts";
import { TagsInput } from "../purchases/purchases";

type Acc = { id: string; supplierId: string; supplier: string; programId: string; program: string; color: string; identifier: string | null; balance: number; priceCpmCents: number; cpfAvailable: number | null; tags: string[]; avgUsage: number | null; notes: string | null; updatedAt: string };

export function SupplierAccounts({ accounts, suppliers, programs, programId, supplierId }: { accounts: Acc[]; suppliers: { id: string; name: string }[]; programs: { id: string; name: string }[]; programId: string; supplierId: string }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Acc | "new" | null>(null);
  const [erro, setErro] = useState("");
  const cur = edit && edit !== "new" ? edit : null;
  const [balance, setBalance] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  // Ao abrir o formulário, carrega saldo e tags da conta (ou zera para uma nova)
  useEffect(() => {
    if (!edit) return;
    setBalance(cur ? fmtPts(cur.balance) : "");
    setTags(cur?.tags ?? []);
  }, [edit]); // eslint-disable-line react-hooks/exhaustive-deps
  const filter = (k: string, v: string) => {
    const u = new URLSearchParams({ ...(programId ? { programId } : {}), ...(supplierId ? { supplierId } : {}) });
    v ? u.set(k, v) : u.delete(k);
    router.push(`/app/management?${u}`);
  };
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const price = parseBRLToCents(String(f.get("price") || "0"));
    if (price === null) return setErro("Preço inválido");
    const body = {
      supplierId: f.get("supplierId"), programId: f.get("programId"), identifier: f.get("identifier") || null,
      balance: parsePts(balance), priceCpmCents: price, tags, cpfAvailable: String(f.get("cpf") || "").trim() ? Number(f.get("cpf")) : null, notes: f.get("notes") || null,
    };
    const r = cur ? await api(`/api/supplier-accounts/${cur.id}`, "PATCH", body) : await api("/api/supplier-accounts", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setEdit(null);
    toast(cur ? "Conta atualizada" : "Conta cadastrada");
    refreshSafe(router);
  }
  async function remove(a: Acc) {
    if (!(await confirmDialog({ title: `Excluir conta ${a.program} de ${a.supplier}?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/supplier-accounts/${a.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Conta excluída");
    refreshSafe(router);
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap gap-2">
        <select className="input w-full sm:w-52" value={programId} onChange={(e) => filter("programId", e.target.value)} aria-label="Filtrar por programa"><option value="">Todos os programas</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <select className="input w-full sm:w-52" value={supplierId} onChange={(e) => filter("supplierId", e.target.value)} aria-label="Filtrar por fornecedor"><option value="">Todos os fornecedores</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <button className="btn-primary sm:ml-auto" onClick={() => { setErro(""); setEdit("new"); }} disabled={suppliers.length === 0} title={suppliers.length === 0 ? "Cadastre um fornecedor antes" : undefined}><Plus className="h-4 w-4" />Nova conta</button>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Nenhuma conta de fornecedor encontrada" icon={<Contact className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{suppliers.length === 0 ? "Cadastre um fornecedor na aba “Fornecedores” e depois as contas dele aqui." : "Crie uma nova conta usando o botão acima."}</p>
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Fornecedor</th><th>Programa</th><th className="text-right">Saldo</th><th className="hidden text-right sm:table-cell">Preço/milheiro</th><th className="hidden text-right md:table-cell">CPFs</th><th className="hidden text-right lg:table-cell">Média Utiliz.</th><th className="hidden md:table-cell">Atualizado</th><th>Disponível</th><th className="w-24"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><span className="block truncate font-semibold">{a.supplier}</span><span className="block truncate text-xs text-muted">{[a.identifier, ...a.tags].filter(Boolean).join(" · ")}</span></td>
                  <td><span className="flex items-center gap-2"><ProgramDot color={a.color} />{a.program}</span></td>
                  <td className="text-right tabular-nums">{fmtPts(a.balance)}</td>
                  <td className="hidden text-right tabular-nums sm:table-cell">{a.priceCpmCents ? fmtBRL(a.priceCpmCents) : "-"}</td>
                  <td className="hidden text-right tabular-nums md:table-cell">{a.cpfAvailable ?? "-"}</td>
                  <td className="hidden text-right tabular-nums lg:table-cell">{a.avgUsage ? `${fmtPts(a.avgUsage)} pts` : "-"}</td>
                  <td className="hidden text-muted md:table-cell">{fmtDate(a.updatedAt)}</td>
                  <td>{a.balance > 0 && a.cpfAvailable !== 0 ? <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-300">Sim</span> : <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs text-muted" title={a.balance <= 0 ? "Sem saldo" : "Sem CPFs"}>Não</span>}</td>
                  <td className="whitespace-nowrap text-right">
                    <button className="btn-subtle h-8 w-8 px-0" onClick={() => { setErro(""); setEdit(a); }} aria-label={`Editar conta ${a.program} de ${a.supplier}`}><Pencil className="h-4 w-4" /></button>
                    <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a)} aria-label={`Excluir conta ${a.program} de ${a.supplier}`}><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={cur ? "Editar conta" : "Nova conta de fornecedor"} footer={<><button className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button form="supacc-form" className="btn-primary">Salvar</button></>}>
        <form id="supacc-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2" key={cur?.id ?? "new"}>
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          <Field label="Fornecedor" required><select className="input" name="supplierId" required defaultValue={cur?.supplierId ?? ""}><option value="" disabled>Selecione</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          <Field label="Programa" required><select className="input" name="programId" required defaultValue={cur?.programId ?? ""}><option value="" disabled>Selecione</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
          <Field label="Identificação" hint="Número de fidelidade ou apelido. Nunca guarde senhas aqui."><input className="input" name="identifier" maxLength={80} defaultValue={cur?.identifier ?? ""} /></Field>
          <Field label="Saldo atual"><PointsInput label="Saldo atual" value={balance} onChange={setBalance} /></Field>
          <Field label="Preço combinado por milheiro (R$)"><input className="input" name="price" inputMode="decimal" defaultValue={cur ? (cur.priceCpmCents / 100).toFixed(2).replace(".", ",") : ""} placeholder="0,00" /></Field>
          <Field label="CPFs disponíveis" hint="Quantos passageiros ainda podem ser emitidos nessa conta"><input className="input" name="cpf" type="number" min={0} max={1000} defaultValue={cur?.cpfAvailable ?? ""} placeholder="Ex: 5" /></Field>
          <Field label="Tags" className="sm:col-span-2"><TagsInput value={tags} onChange={setTags} suggestions={[...new Set(accounts.flatMap((x) => x.tags))]} /></Field>
          <Field label="Observações" className="sm:col-span-2"><input className="input" name="notes" maxLength={500} defaultValue={cur?.notes ?? ""} /></Field>
        </form>
      </Modal>
    </>
  );
}

export function Suppliers({ suppliers }: { suppliers: { id: string; name: string; contact: string | null; notes: string | null; accounts: number; balance: number }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [erro, setErro] = useState("");
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const r = await api("/api/suppliers", "POST", { name: f.get("name"), contact: f.get("contact") || null, notes: f.get("notes") || null });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setOpen(false);
    toast("Fornecedor cadastrado");
    refreshSafe(router);
  }
  async function remove(s: { id: string; name: string; accounts: number }) {
    if (!(await confirmDialog({ title: `Excluir ${s.name}?`, body: s.accounts ? `As ${s.accounts} contas dele também serão excluídas.` : undefined, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/suppliers/${s.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Fornecedor excluído");
    refreshSafe(router);
  }
  return (
    <>
      <div className="mb-4 flex justify-end"><button className="btn-primary" onClick={() => { setErro(""); setOpen(true); }}><Plus className="h-4 w-4" />Novo fornecedor</button></div>
      {suppliers.length === 0 ? (
        <Empty title="Nenhum fornecedor cadastrado" icon={<Users className="h-5 w-5" />} />
      ) : (
        <div className="card overflow-hidden">
          <table className="table-base">
            <thead><tr><th>Fornecedor</th><th className="hidden sm:table-cell">Contato</th><th className="text-right">Contas</th><th className="text-right">Saldo total</th><th className="w-12"><span className="sr-only">Ações</span></th></tr></thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td><span className="flex items-center gap-3"><Avatar name={s.name} /><span className="min-w-0"><span className="block truncate font-semibold">{s.name}</span>{s.notes && <span className="block truncate text-xs text-muted">{s.notes}</span>}</span></span></td>
                  <td className="hidden text-muted sm:table-cell">{s.contact ?? "-"}</td>
                  <td className="text-right tabular-nums">{s.accounts}</td>
                  <td className="text-right tabular-nums">{fmtPts(s.balance)}</td>
                  <td className="text-right"><button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(s)} aria-label={`Excluir ${s.name}`}><Trash2 className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="Novo fornecedor" size="sm" footer={<><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button form="supplier-form" className="btn-primary">Salvar</button></>}>
        <form id="supplier-form" onSubmit={add} className="space-y-4">
          {erro && <Alert>{erro}</Alert>}
          <Field label="Nome" required><input className="input" name="name" required maxLength={100} /></Field>
          <Field label="Contato"><input className="input" name="contact" maxLength={120} placeholder="Telefone ou e-mail" /></Field>
          <Field label="Observações"><input className="input" name="notes" maxLength={500} /></Field>
        </form>
      </Modal>
    </>
  );
}
