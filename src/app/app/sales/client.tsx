"use client";
// Vendas: lista (Data, Programa, Descrição, Pontos, Valor, Resultado, Ações), detalhes e a aba Clientes.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, MoreHorizontal, Eye, Trash2, HandCoins, Users, Pencil, FileText, X, Eraser, ArrowDown, ArrowUp, ChevronsUpDown, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, fmtPts } from "@/lib/format";
import { airportLabel } from "@/domain/airports";
import { ProgramDot } from "@/components/stat";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { maskDoc } from "../programs/holder-dialog";
import { SaleDialog, type SaleAccount, type SaleSupplier, type SaleCustomer, type SaleCard } from "./sale-dialog";
import type { SaleView } from "@/server/services/sales";

const COST_LABELS: Record<string, string> = { TAXA_EMBARQUE: "Taxa de embarque", IOF: "IOF", BAGAGEM: "Bagagem", ASSENTO: "Assento", COMPLETAR_PONTOS: "Completar pontos", OUTROS: "Outros" };

export function SalesClient({ sales, accounts, suppliers, customers, cards, sp, editSale }: { sales: SaleView[]; accounts: SaleAccount[]; suppliers: SaleSupplier[]; customers: SaleCustomer[]; cards: SaleCard[]; sp: Record<string, string>; editSale?: SaleView | null }) {
  const router = useRouter();
  const nav = useNav();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<SaleView | null>(null);
  const [editingSale, setEditingSale] = useState<SaleView | null>(editSale ?? null);
  const [menu, setMenu] = useState<{ s: SaleView; top: number; right: number } | null>(null);

  useEffect(() => {
    const open = () => setCreating(true);
    window.addEventListener("mm:new-sale", open);
    return () => window.removeEventListener("mm:new-sale", open);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);

  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    nav(`/app/sales?${u}`);
  };
  const sortHeader = (col: string, label: string) => {
    const cur = sp.sort ?? "occurredAt";
    const dir = sp.order ?? "desc";
    return (
      <button type="button" className="inline-flex items-center gap-1 hover:text-white" onClick={() => go({ sort: col, order: cur === col && dir === "desc" ? "asc" : "desc" })}>
        {label}{cur !== col ? <ChevronsUpDown className="h-3.5 w-3.5 opacity-60" /> : dir === "desc" ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
      </button>
    );
  };
  async function remove(s: SaleView) {
    const ok = await confirmDialog({ title: "Excluir venda?", body: s.origin === "OWN" ? "Os pontos voltam para a conta e saldos e custos são recalculados." : "O saldo volta para a conta do fornecedor.", confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    const r = await api(`/api/sales/${s.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Venda excluída");
    refreshSafe(router);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <form className="relative min-w-0 flex-1" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") || "") || null }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" name="q" placeholder="Buscar por descrição, localizador, cliente ou aeroporto" defaultValue={params.get("q") ?? ""} key={params.get("q") ?? ""} aria-label="Buscar vendas" />
        </form>
        <select className="input w-full sm:w-56" value={params.get("customerId") ?? ""} onChange={(e) => go({ customerId: e.target.value || null })} aria-label="Filtrar por cliente">
          <option value="">Todos os clientes</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="btn-primary" onClick={() => setCreating(true)} disabled={accounts.length === 0 && suppliers.length === 0}><Plus className="h-4 w-4" />Registrar venda</button>
      </div>

      {sales.length === 0 ? (
        <Empty title="Nenhuma venda cadastrada" icon={<HandCoins className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{params.get("q") || params.get("customerId") ? "Nenhuma venda com esses filtros." : "Comece registrando sua primeira venda."}</p>
          <button className="btn-primary" onClick={() => setCreating(true)}>Registrar venda</button>
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr><th>{sortHeader("occurredAt", "Data")}</th><th>Programa</th><th>Descrição</th><th className="text-right">{sortHeader("points", "Pontos")}</th><th className="text-right" title="Preço do milheiro vendido (valor dos pontos ÷ pontos × 1.000)">Milheiro</th><th className="text-right" title="CPFs emitidos">CPFs</th><th className="text-right">{sortHeader("totalCents", "Valor")}</th><th className="text-right">Resultado</th><th className="text-right">ROE</th><th className="text-right">Lucro/CPF</th><th className="w-16 text-right">Ações</th></tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(s.date)}</td>
                    <td className="max-w-[180px]"><span className="flex items-center gap-2"><ProgramDot color={s.color} /><span className="truncate font-medium">{s.program}</span></span></td>
                    <td className="max-w-[260px]">
                      <button type="button" className="block max-w-full truncate text-left hover:underline" onClick={() => setViewing(s)}>{s.description}</button>
                      {s.customers.length > 0 && <span className="block truncate text-xs text-muted">{s.customers.join(", ")}</span>}
                    </td>
                    <td className="text-right tabular-nums">{s.points ? fmtPts(s.points) : "-"}</td>
                    <td className="text-right tabular-nums">{s.points > 0 && s.pointsValueCents > 0 ? fmtBRL(Math.round((s.pointsValueCents * 1000) / s.points)) : "-"}</td>
                    <td className="text-right tabular-nums">{s.cpfs || "-"}</td>
                    <td className="text-right tabular-nums">{fmtBRL(s.totalCents)}</td>
                    <td className={`text-right font-semibold tabular-nums ${s.resultCents >= 0 ? "text-ok" : "text-bad"}`}>{fmtBRL(s.resultCents)}</td>
                    <td className="text-right tabular-nums">{s.roePct == null ? "-" : `${s.roePct.toLocaleString("pt-BR")}%`}</td>
                    <td className="text-right tabular-nums">{s.cpfs > 0 ? fmtBRL(Math.round(s.resultCents / s.cpfs)) : "-"}</td>
                    <td className="text-right">
                      <button className="btn-subtle h-8 w-8 px-0" aria-label={`Ações da venda ${s.description}`} aria-haspopup="menu" onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.s.id === s.id ? null : { s, top: r.bottom + 4, right: window.innerWidth - r.right }); }}><MoreHorizontal className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {menu && (
        <div role="menu" style={{ top: menu.top, right: menu.right }} className="fixed z-50 w-44 rounded-xl border border-line bg-panel2 p-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setViewing(menu.s); setMenu(null); }}><Eye className="h-4 w-4" />Ver detalhes</button>
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setEditingSale(menu.s); setMenu(null); }}><Pencil className="h-4 w-4" />Editar</button>
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-line" onClick={() => { const s = menu.s; setMenu(null); remove(s); }}><Trash2 className="h-4 w-4" />Excluir</button>
        </div>
      )}
      {creating && <SaleDialog accounts={accounts} suppliers={suppliers} customers={customers} cards={cards} onClose={() => setCreating(false)} />}
      {editingSale && <SaleDialog key={editingSale.id} editing={editingSale} accounts={accounts} suppliers={suppliers} customers={customers} cards={cards} onClose={() => { setEditingSale(null); if (sp.edit) nav("/app/sales", { replace: true }); }} />}
      {viewing && <SaleDetails sale={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function SaleDetails({ sale: s, onClose }: { sale: SaleView; onClose: () => void }) {
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    if (s.attachments) api<{ items: { id: string; name: string }[] }>(`/api/sales/${s.id}/attachments`).then((r) => r.ok && setFiles(r.data.items));
  }, [s.id, s.attachments]);
  const line = (label: string, value: React.ReactNode) => <div className="flex items-start justify-between gap-4 py-1.5 text-sm"><span className="text-muted">{label}</span><span className="text-right font-medium tabular-nums">{value}</span></div>;
  return (
    <Modal open onClose={onClose} title="Detalhes da venda" footer={<button className="btn-primary" onClick={onClose}>Fechar</button>}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3 rounded-xl bg-panel2 p-3 text-center text-sm sm:grid-cols-5">
          <div><p className="text-xs text-muted">Total</p><p className="font-semibold tabular-nums">{fmtBRL(s.totalCents)}</p></div>
          <div><p className="text-xs text-muted">Custo</p><p className="font-semibold tabular-nums">{fmtBRL(s.costCents)}</p></div>
          <div><p className="text-xs text-muted">Resultado</p><p className={`font-semibold tabular-nums ${s.resultCents >= 0 ? "text-ok" : "text-bad"}`}>{fmtBRL(s.resultCents)}{s.marginPct != null && <span className="block text-xs font-normal text-muted">{s.marginPct.toLocaleString("pt-BR")}%</span>}</p></div>
          <div><p className="text-xs text-muted">ROE</p><p className="font-semibold tabular-nums">{s.roePct == null ? "-" : `${s.roePct.toLocaleString("pt-BR")}%`}</p></div>
          <div><p className="text-xs text-muted">Lucro por CPF</p><p className="font-semibold tabular-nums">{s.cpfs > 0 ? fmtBRL(Math.round(s.resultCents / s.cpfs)) : "-"}<span className="block text-xs font-normal text-muted">{s.cpfs} {s.cpfs === 1 ? "CPF" : "CPFs"}</span></p></div>
        </div>
        <div className="divide-y divide-line">
          {line("Data", fmtDate(s.date))}
          {line("Origem dos pontos", s.origin === "OWN" ? "Meus pontos" : "Fornecedor")}
          {line("Programa", s.program)}
        </div>
        {s.items.map((it, n) => (
          <section key={it.id} className="rounded-xl border border-line p-3">
            <p className="mb-1 font-semibold">{s.items.length > 1 ? `${n + 1}. ` : ""}{it.label}{it.reservation ? ` · ${it.reservation}` : ""}</p>
            <div className="divide-y divide-line">
              {line("Emissão", it.issuedWith === "POINTS" ? `${fmtPts(it.points)} pontos` : `Dinheiro (${fmtBRL(it.cashCostCents)})`)}
              {line(it.issuedWith === "POINTS" ? "Valor dos pontos" : "Valor da venda", fmtBRL(it.salePriceCents))}
              {it.issuedWith === "POINTS" && line("Custo dos pontos", fmtBRL(it.pointsCostCents))}
              {it.costs.map((c, k) => <div key={k}>{line(`Repassado: ${COST_LABELS[c.type] ?? c.type}`, fmtBRL(c.amountCents))}</div>)}
              {line("Resultado do item", <span className={it.resultCents >= 0 ? "text-ok" : "text-bad"}>{fmtBRL(it.resultCents)}</span>)}
              {it.customers.length > 0 && line(it.clientType === "AGENCY" ? "Agência" : "Clientes", it.customers.join(", "))}
              {it.passengers != null && line("Passageiros", it.passengers)}
              {(it.origin || it.destination) && line("Trecho", `${it.origin ? airportLabel(it.origin) : "?"} → ${it.destination ? airportLabel(it.destination) : "?"}`)}
              {it.departureDate && line(it.kind === "HOTEL" ? "Entrada" : it.kind === "CAR" ? "Retirada" : "Ida", fmtDate(it.departureDate))}
              {it.returnDate && line(it.kind === "HOTEL" ? "Saída" : it.kind === "CAR" ? "Devolução" : "Volta", fmtDate(it.returnDate))}
              {it.description && line("Descrição", it.description)}
            </div>
            {it.observation && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{it.observation}</p>}
          </section>
        ))}
        {files.length > 0 && (
          <div>
            <p className="kicker mb-1">Anexos</p>
            <ul className="divide-y divide-line">{files.map((f) => <li key={f.id}><a className="flex items-center gap-2 py-2 text-sm hover:underline" href={`/api/sales/${s.id}/attachments/${f.id}`}><FileText className="h-4 w-4 text-muted" />{f.name}</a></li>)}</ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

/* ---------------- Clientes ---------------- */

export type CustomerRow = { id: string; name: string; kind: "FINAL" | "AGENCY"; docType: string | null; docNumber: string | null; email: string | null; phone: string | null; documents: { type: string; number: string }[]; lastPurchase: string | null; purchases: number };

export function CustomersClient({ customers }: { customers: CustomerRow[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<CustomerRow | "new" | null>(null);
  async function remove(c: CustomerRow) {
    if (!(await confirmDialog({ title: `Excluir ${c.name}?`, body: "As vendas continuam, só sem esse cliente.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/customers/${c.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Cliente excluído");
    refreshSafe(router);
  }
  return (
    <>
      {customers.length === 0 ? (
        <Empty title="Nenhum cliente cadastrado" icon={<Users className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Comece criando seu primeiro cliente.</p>
          <button className="btn-primary" onClick={() => setEditing("new")}>Criar cliente</button>
        </Empty>
      ) : (
        <>
          <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Criar cliente</button></div>
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Identificador</th><th>Nome</th><th>Tipo</th><th>Última Compra</th><th className="w-24 text-right">Ações</th></tr></thead>
                <tbody>
                  {customers.map((c) => (
                    <tr key={c.id}>
                      <td className="tabular-nums text-muted">{c.docNumber ? `${c.docType ?? ""} ${c.docNumber}`.trim() : "-"}</td>
                      <td className="font-medium">{c.name}{(c.email || c.phone) && <span className="block text-xs font-normal text-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>}</td>
                      <td>{c.kind === "AGENCY" ? "Agência" : "Cliente final"}</td>
                      <td className="tabular-nums">{c.lastPurchase ? fmtDate(c.lastPurchase) : <span className="text-muted">-</span>}</td>
                      <td className="whitespace-nowrap text-right">
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(c)} aria-label={`Editar ${c.name}`}><Pencil className="h-4 w-4" /></button>
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(c)} aria-label={`Excluir ${c.name}`}><Trash2 className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      {editing && <CustomerDialog customer={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

const maskPhone = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d.length > 10 ? d.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3") : d.replace(/(\d{2})(\d{0,4})(\d{0,4})/, (_, a, b, c) => (b ? `(${a}) ${b}${c ? `-${c}` : ""}` : a));
};

function CustomerDialog({ customer, onClose }: { customer: CustomerRow | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({
    name: customer?.name ?? "",
    kind: customer?.kind ?? "FINAL",
    docType: customer?.docType ?? "CPF",
    docNumber: customer?.docNumber ?? "",
    email: customer?.email ?? "",
    phone: customer?.phone ?? "",
  });
  const empty = { type: "CNPJ", number: "" };
  const [docs, setDocs] = useState([...(customer?.documents ?? []), empty]);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const DOCS = [["CPF", "CPF"], ["CNPJ", "CNPJ"], ["RG", "RG"], ["PASSAPORTE", "Passaporte"]] as const;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return setErro("Informe o nome");
    if (!f.docNumber.trim()) return setErro("Informe o número do identificador");
    const digits = f.docNumber.replace(/\D/g, "").length;
    if ((f.docType === "CPF" && digits !== 11) || (f.docType === "CNPJ" && digits !== 14)) return setErro(`${f.docType} incompleto`);
    setBusy(true);
    const body = { ...f, documents: docs.filter((d) => d.number.trim()) };
    const r = customer ? await api(`/api/customers/${customer.id}`, "PATCH", body) : await api("/api/customers", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(customer ? "Cliente atualizado" : "Cliente cadastrado");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal open onClose={onClose} title={customer ? "Editar cliente" : "Novo cliente"} footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="customer-form" className="btn-primary" disabled={busy}>{customer ? "Salvar alterações" : "Criar cliente"}</button></>}>
      <form id="customer-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
        <Field label="Nome" required className="sm:col-span-2"><input className="input" maxLength={100} placeholder="Ex: Maria Silva" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tipo" required>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "FINAL" | "AGENCY" })} aria-label="Tipo">
            <option value="FINAL">Cliente Final</option>
            <option value="AGENCY">Agência</option>
          </select>
        </Field>
        <Field label="Identificador" required>
          <div className="grid grid-cols-[96px_1fr] gap-2">
            <select className="input" value={f.docType} onChange={(e) => setF({ ...f, docType: e.target.value, docNumber: maskDoc(e.target.value, f.docNumber) })} aria-label="Tipo do identificador"><option value="CPF">CPF</option><option value="CNPJ">CNPJ</option></select>
            <input className="input" placeholder={f.docType === "CPF" ? "000.000.000-00" : "00.000.000/0000-00"} value={f.docNumber} onChange={(e) => setF({ ...f, docNumber: maskDoc(f.docType, e.target.value) })} aria-label="Número do identificador" />
          </div>
        </Field>
        <Field label="E-mail"><input className="input" type="email" maxLength={120} placeholder="Ex: email@exemplo.com" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Telefone"><input className="input" inputMode="tel" placeholder="(00) 00000-0000" value={f.phone} onChange={(e) => setF({ ...f, phone: maskPhone(e.target.value) })} /></Field>
        <div className="space-y-2 sm:col-span-2">
          <p className="label">Documentos adicionais <span className="font-normal text-muted">· Informe mais documentos</span></p>
          {docs.map((d, k) => {
            const draft = k === docs.length - 1;
            const upd = (patch: Partial<typeof d>) => { const next = docs.map((x, j) => (j === k ? { ...x, ...patch } : x)); setDocs(next.at(-1)!.number.trim() ? [...next, empty] : next); };
            return (
              <div key={k} className="grid grid-cols-[120px_1fr_auto] gap-2">
                <select className="input" value={d.type} onChange={(e) => upd({ type: e.target.value, number: maskDoc(e.target.value, d.number) })} aria-label={`Tipo do documento adicional ${k + 1}`}>{DOCS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                <input className="input" placeholder={d.type === "CPF" ? "000.000.000-00" : d.type === "CNPJ" ? "00.000.000/0000-00" : "Número do documento"} value={d.number} onChange={(e) => upd({ number: maskDoc(d.type, e.target.value) })} aria-label={`Número do documento adicional ${k + 1}`} />
                <button type="button" className="btn-subtle h-10 w-10 px-0" onClick={() => setDocs(draft ? [...docs.slice(0, -1), empty] : docs.filter((_, j) => j !== k))} aria-label={draft ? "Limpar novo documento" : `Remover documento ${k + 1}`}>{draft ? <Eraser className="h-4 w-4" /> : <X className="h-4 w-4" />}</button>
              </div>
            );
          })}
        </div>
      </form>
    </Modal>
  );
}
