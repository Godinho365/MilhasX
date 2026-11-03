"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Copy } from "lucide-react";
import { api, today } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { Stat } from "@/components/stat";
import { toast } from "@/components/feedback";

type Item = { id: string; date: string; description: string; customers: string[]; totalCents: number; serviceCents: number; refunded: boolean; nfNumber: string | null; nfIssuedAt: string | null };

export function InvoicesClient({ items }: { items: Item[] }) {
  const [editing, setEditing] = useState<Item | null>(null);
  const pending = items.filter((i) => !i.nfNumber);
  const service = pending.reduce((t, i) => t + i.serviceCents, 0);
  function copy(i: Item) {
    const text = `Serviço de intermediação de emissão de passagem: ${i.description}${i.customers.length ? ` · Cliente: ${i.customers.join(", ")}` : ""} · Valor do serviço: ${fmtBRL(i.serviceCents)}`;
    navigator.clipboard.writeText(text).then(() => toast("Descrição copiada"), () => toast("Não deu para copiar", "error"));
  }
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Vendas no mês" value={String(items.length)} />
        <Stat label="Sem nota" value={String(pending.length)} hint="vendas que ainda precisam da NFSe" />
        <Stat label="Serviço a faturar" value={fmtBRL(service)} hint="soma do lucro das vendas sem nota" accent />
      </div>
      {items.length === 0 ? (
        <Empty title="Nenhuma venda neste filtro" icon={<FileText className="h-5 w-5" />} />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th className="text-right">Total da venda</th><th className="text-right" title="Lucro da venda">Valor do serviço</th><th>Nota fiscal</th><th className="w-28 text-right">Ações</th></tr></thead>
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(i.date)}</td>
                    <td className="max-w-[260px] truncate">{i.description}{i.refunded && <span className="ml-1 text-xs text-amber-300">(reembolsada)</span>}</td>
                    <td className="max-w-[180px] truncate">{i.customers.join(", ") || "-"}</td>
                    <td className="text-right tabular-nums">{fmtBRL(i.totalCents)}</td>
                    <td className="text-right font-semibold tabular-nums">{fmtBRL(i.serviceCents)}</td>
                    <td>{i.nfNumber ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Nº {i.nfNumber}{i.nfIssuedAt && ` · ${fmtDate(i.nfIssuedAt)}`}</span> : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">Sem nota</span>}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => copy(i)} aria-label={`Copiar descrição da nota de ${i.description}`} title="Copiar descrição para o emissor da prefeitura"><Copy className="h-4 w-4" /></button>
                        <button className="btn-ghost h-8 px-2 text-xs" onClick={() => setEditing(i)}>{i.nfNumber ? "Editar" : "Registrar nota"}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Emita a NFSe no emissor da sua prefeitura (ou do seu contador) e registre aqui o número. O valor do serviço é o lucro da venda; a passagem em si é repasse e não entra na nota. A emissão automática precisa de um provedor de nota fiscal ligado à sua conta.</p>
      {editing && <InvoiceDialog item={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function InvoiceDialog({ item, onClose }: { item: Item; onClose: () => void }) {
  const router = useRouter();
  const [number, setNumber] = useState(item.nfNumber ?? "");
  const [date, setDate] = useState(item.nfIssuedAt ?? today());
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const r = await api(`/api/sales/${item.id}/invoice`, "POST", { number: number.trim() || null, date });
    if (!r.ok) return setErro(r.erro);
    toast(number.trim() ? "Nota registrada" : "Nota removida");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title="Nota fiscal da venda" size="sm" icon={<FileText className="h-5 w-5" />}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="nf-form" className="btn-primary">Salvar</button></>}>
      <form id="nf-form" onSubmit={save} className="space-y-3">
        <p className="text-sm text-muted">{item.description} · serviço {fmtBRL(item.serviceCents)}</p>
        {erro && <Alert>{erro}</Alert>}
        <Field label="Número da NFSe" hint="Deixe vazio para apagar"><input className="input" value={number} onChange={(e) => setNumber(e.target.value)} maxLength={40} aria-label="Número da NFSe" autoFocus /></Field>
        <Field label="Data de emissão"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data de emissão" /></Field>
      </form>
    </Modal>
  );
}
