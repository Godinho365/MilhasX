"use client";
// "Nova venda" como na referência: origem dos pontos, programa e data; itens (passagem, bagagem,
// assento, hospedagem, carro, outro) com emissão, valor, custos repassados, cliente e reserva,
// viagem e detalhes; anexos e total. Os anexos sobem depois que a venda é criada.
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { Plus, Receipt, Users, Plane, FileText, Paperclip, Upload, X, Eraser, ChevronDown, Trash2 } from "lucide-react";
import { api, newKey, today } from "@/lib/api";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { AIRPORTS } from "@/domain/airports";
import { Modal, Field, Alert } from "@/components/ui";
import { Collapsible, PointsInput, parsePts } from "@/components/form-parts";
import { toast, confirmDialog } from "@/components/feedback";
import { fmtSize } from "../programs/holder-dialog";

export type SaleAccount = { id: string; label: string; balance: number; costCents: number };
export type SaleSupplier = { id: string; label: string; balance: number; priceCpmCents: number };
export type SaleCustomer = { id: string; name: string; kind: "FINAL" | "AGENCY" };
export type SaleCard = { id: string; name: string };

const KINDS = [["FLIGHT", "Passagem aérea"], ["BAGGAGE", "Bagagem"], ["SEAT", "Assento"], ["HOTEL", "Hospedagem"], ["CAR", "Aluguel de carro"], ["OTHER", "Outro"]] as const;
type Kind = (typeof KINDS)[number][0];
const COSTS = [["TAXA_EMBARQUE", "Taxa de embarque"], ["IOF", "IOF"], ["BAGAGEM", "Bagagem"], ["ASSENTO", "Assento"], ["COMPLETAR_PONTOS", "Completar pontos"], ["OUTROS", "Outros"]] as const;
const kindLabel = (k: string) => KINDS.find(([v]) => v === k)?.[1] ?? k;
const TRAVEL: Kind[] = ["FLIGHT", "BAGGAGE", "SEAT"];
const MAX_FILES = 10;
const MAX_TOTAL = 10 * 1024 * 1024;
const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,application/pdf";

type CostRow = { type: string; amount: string; cardId: string };
type Item = {
  kind: Kind;
  issuedWith: "POINTS" | "CASH";
  points: string;
  price: string; // valor dos pontos (R$)
  byCpm: boolean; // "Informar valor do milheiro"
  cpm: string;
  cashCost: string;
  costs: CostRow[];
  clientType: "FINAL" | "AGENCY";
  customerIds: string[];
  passengers: string;
  reservation: string;
  origin: string;
  destination: string;
  departure: string;
  ret: string;
  description: string;
  observation: string;
  open: { costs: boolean; client: boolean; travel: boolean; other: boolean };
};
const emptyCost = (): CostRow => ({ type: "TAXA_EMBARQUE", amount: "", cardId: "" });
const newItem = (kind: Kind = "FLIGHT"): Item => ({
  kind, issuedWith: "POINTS", points: "", price: "", byCpm: false, cpm: "", cashCost: "", costs: [emptyCost()], clientType: "FINAL", customerIds: [],
  passengers: kind === "FLIGHT" ? "1" : "", reservation: "", origin: "", destination: "", departure: "", ret: "", description: "", observation: "",
  open: { costs: false, client: true, travel: kind === "FLIGHT", other: false },
});
const money = (v: string) => (v.trim() ? parseBRLToCents(v) : 0);
/** Valor dos pontos do item: digitado ou calculado pelo valor do milheiro. */
function itemPrice(it: Item) {
  if (it.issuedWith === "POINTS" && it.byCpm) return Math.round((parsePts(it.points) * (money(it.cpm) ?? 0)) / 1000);
  return money(it.price) ?? 0;
}
const itemCosts = (it: Item) => it.costs.reduce((t, c) => t + (money(c.amount) ?? 0), 0);

function AirportField({ label, value, onChange }: { label: string; value: string; onChange: (code: string) => void }) {
  const [text, setText] = useState(value);
  return (
    <Field label={label}>
      <input className="input" list="sale-airports" placeholder="Selecione o aeroporto" value={text} aria-label={label}
        onChange={(e) => { setText(e.target.value); const code = e.target.value.trim().slice(0, 3).toUpperCase(); onChange(AIRPORTS.some((a) => a.code === code) ? code : ""); }} />
    </Field>
  );
}

/** Seleção de vários clientes (lista com caixas de marcar). */
function CustomerPicker({ customers, kind, value, onChange, label }: { customers: SaleCustomer[]; kind: "FINAL" | "AGENCY"; value: string[]; onChange: (ids: string[]) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);
  const list = customers.filter((c) => c.kind === kind);
  const chosen = customers.filter((c) => value.includes(c.id));
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="input flex items-center justify-between text-left" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={label}>
        <span className={`truncate ${chosen.length ? "" : "text-muted"}`}>{chosen.length ? chosen.map((c) => c.name).join(", ") : "Selecionar clientes"}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-line bg-panel p-1 shadow-xl" role="listbox" aria-label={label}>
          {list.length === 0 ? <p className="px-3 py-2 text-sm text-muted">Nenhum {kind === "AGENCY" ? "cliente do tipo agência" : "cliente final"} cadastrado. Cadastre na aba Clientes.</p> : list.map((c) => (
            <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel2">
              <input type="checkbox" className="checkbox" checked={value.includes(c.id)} onChange={(e) => onChange(e.target.checked ? [...value, c.id] : value.filter((x) => x !== c.id))} />
              {c.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

export function SaleDialog({ accounts, suppliers, customers, cards, onClose }: { accounts: SaleAccount[]; suppliers: SaleSupplier[]; customers: SaleCustomer[]; cards: SaleCard[]; onClose: () => void }) {
  const router = useRouter();
  const [key] = useState(newKey);
  const [origin, setOrigin] = useState<"OWN" | "SUPPLIER">("OWN");
  const [accountId, setAccountId] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(today());
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [files, setFiles] = useState<File[]>([]);
  const [filesOpen, setFilesOpen] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [drag, setDrag] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const setItem = (i: number, patch: Partial<Item>) => { setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x))); setDirty(true); };
  const total = items.reduce((t, it) => t + itemPrice(it) + itemCosts(it), 0);
  const points = items.reduce((t, it) => t + (it.issuedWith === "POINTS" ? parsePts(it.points) : 0), 0);
  const acc = accounts.find((a) => a.id === accountId);
  const sup = suppliers.find((s) => s.id === supplierId);
  const costCpm = origin === "OWN" ? (acc && acc.balance > 0 ? acc.costCents / acc.balance * 1000 : 0) : (sup?.priceCpmCents ?? 0);
  const estimate = items.reduce((t, it) => t + itemPrice(it) - (it.issuedWith === "POINTS" ? Math.round((parsePts(it.points) * costCpm) / 1000) : (money(it.cashCost) ?? 0)), 0);
  const available = origin === "OWN" ? acc?.balance : sup?.balance;
  const filesSize = files.reduce((t, f) => t + f.size, 0);

  function addFiles(list: FileList | File[]) {
    const next = [...files];
    for (const f of Array.from(list)) {
      if (next.length >= MAX_FILES) { toast(`No máximo ${MAX_FILES} arquivos`, "error"); break; }
      if (next.reduce((t, x) => t + x.size, 0) + f.size > MAX_TOTAL) { toast(`${f.name}: os anexos passam de 10 MB`, "error"); continue; }
      if (f.type && !ACCEPT.split(",").includes(f.type)) { toast(`${f.name}: envie PNG, JPEG, WEBP, HEIC ou PDF`, "error"); continue; }
      next.push(f);
    }
    setFiles(next);
    setDirty(true);
  }

  async function requestClose() {
    if (!dirty || (await confirmDialog({ title: "Descartar alterações?", body: "Os dados preenchidos serão perdidos.", confirmLabel: "Descartar", danger: true }))) onClose();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (origin === "OWN" && !accountId) return setErro("Selecione o programa");
    if (origin === "SUPPLIER" && !supplierId) return setErro("Selecione a conta do fornecedor");
    const payload = [];
    for (const [n, it] of items.entries()) {
      const where = items.length > 1 ? ` (item ${n + 1})` : "";
      if (it.issuedWith === "POINTS" && parsePts(it.points) <= 0) return setErro(`Informe os pontos da emissão${where}`);
      const price = itemPrice(it);
      if ((it.byCpm ? money(it.cpm) : money(it.price)) === null || price <= 0) return setErro(`Informe o valor${where}`);
      if (it.issuedWith === "CASH" && money(it.cashCost) === null) return setErro(`Valor pago inválido${where}`);
      const costs = [];
      for (const c of it.costs) {
        if (!c.amount.trim()) continue;
        const v = money(c.amount);
        if (v === null) return setErro(`Valor de custo inválido${where}`);
        costs.push({ type: c.type, amountCents: v, cardId: c.cardId || null });
      }
      if (TRAVEL.includes(it.kind) && it.kind === "FLIGHT" && !(Number(it.passengers) >= 1)) return setErro(`Informe a quantidade de passageiros${where}`);
      payload.push({
        kind: it.kind,
        issuedWith: it.issuedWith,
        points: it.issuedWith === "POINTS" ? parsePts(it.points) : 0,
        salePriceCents: price,
        cashCostCents: it.issuedWith === "CASH" ? (money(it.cashCost) ?? 0) : 0,
        costs,
        clientType: it.clientType,
        customerIds: it.customerIds,
        passengers: it.passengers ? Number(it.passengers) : null,
        reservation: it.reservation || null,
        origin: it.origin || null,
        destination: it.destination || null,
        departureDate: it.departure || null,
        returnDate: it.ret || null,
        description: it.description || null,
        observation: it.observation || null,
      });
    }
    setBusy(true);
    setErro("");
    const r = await api<{ item: { id: string } }>("/api/sales", "POST", { origin, accountId: origin === "OWN" ? accountId : null, supplierAccountId: origin === "SUPPLIER" ? supplierId : null, occurredAt: date, items: payload, idempotencyKey: key });
    if (!r.ok) { setBusy(false); return setErro(r.erro); }
    const failures: string[] = [];
    for (const f of files) {
      const res = await fetch(`/api/sales/${r.data.item.id}/attachments`, { method: "POST", body: f, headers: { "content-type": f.type || "application/octet-stream", "x-file-name": encodeURIComponent(f.name) } });
      if (!res.ok) failures.push(`${f.name}: ${(await res.json().catch(() => ({}))).erro ?? "falha no envio"}`);
    }
    setBusy(false);
    toast(failures.length ? `Venda criada, mas: ${failures.join("; ")}` : "Venda registrada", failures.length ? "error" : undefined);
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal
      open
      onClose={requestClose}
      size="lg"
      title="Nova venda"
      footer={
        <>
          <div className="mr-auto text-sm">
            <p className="text-xs text-muted">Total da venda</p>
            <p className="text-lg font-semibold tabular-nums" aria-label="Total da venda">{fmtBRL(total)}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={requestClose}>Cancelar</button>
          <button form="sale-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Criar venda"}</button>
        </>
      }
    >
      <form id="sale-form" onSubmit={save} className="space-y-5">
        {erro && <Alert>{erro}</Alert>}
        <div>
          <span className="label">Origem dos pontos</span>
          <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Origem dos pontos">
            {([["OWN", "Meus pontos"], ["SUPPLIER", "Fornecedor"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={origin === k} onClick={() => { setOrigin(k); setDirty(true); }} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${origin === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{l}</button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
          {origin === "OWN" ? (
            <Field label="Programa" required>
              <select className="input" value={accountId} onChange={(e) => { setAccountId(e.target.value); setDirty(true); }} aria-label="Programa">
                <option value="" disabled>Selecione o programa</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} ({fmtPts(a.balance)})</option>)}
              </select>
            </Field>
          ) : (
            <Field label="Programa" required>
              <select className="input" value={supplierId} onChange={(e) => { setSupplierId(e.target.value); setDirty(true); }} aria-label="Conta do fornecedor">
                <option value="" disabled>{suppliers.length ? "Selecione a conta do fornecedor" : "Nenhuma conta de fornecedor"}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.label} ({fmtPts(s.balance)})</option>)}
              </select>
            </Field>
          )}
          <Field label="Data" required><input className="input" type="date" value={date} onChange={(e) => { setDate(e.target.value); setDirty(true); }} required /></Field>
        </div>

        {items.map((it, i) => (
          <section key={i} className="space-y-4 rounded-2xl border border-line p-4" aria-label={`Item ${i + 1}: ${kindLabel(it.kind)}`}>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-panel2 text-zinc-300"><Plane className="h-4 w-4" /></span>
              <p className="flex-1 font-semibold">{kindLabel(it.kind)}</p>
              {items.length > 1 && <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setItems(items.filter((_, j) => j !== i))} aria-label={`Remover item ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}
            </div>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label={`Emissão do item ${i + 1}`}>
              {([["POINTS", "Emitido com pontos"], ["CASH", "Emitido com dinheiro"]] as const).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={it.issuedWith === k} onClick={() => setItem(i, { issuedWith: k })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${it.issuedWith === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{l}</button>
              ))}
            </div>
            {it.issuedWith === "POINTS" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Pontos da emissão" required><PointsInput label={`Pontos da emissão do item ${i + 1}`} value={it.points} onChange={(v) => setItem(i, { points: v })} /></Field>
                {it.byCpm ? (
                  <Field label="Valor do milheiro (R$)" required hint={`Valor dos pontos: ${fmtBRL(itemPrice(it))}`}>
                    <input className="input" inputMode="decimal" placeholder="R$ 0,00" value={it.cpm} onChange={(e) => setItem(i, { cpm: e.target.value })} aria-label={`Valor do milheiro do item ${i + 1}`} />
                  </Field>
                ) : (
                  <Field label="Valor dos pontos (R$)" required>
                    <input className="input" inputMode="decimal" placeholder="R$ 0,00" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} aria-label={`Valor dos pontos do item ${i + 1}`} />
                  </Field>
                )}
                <button type="button" className="text-left text-xs font-medium text-accent-light hover:underline sm:col-start-2" onClick={() => setItem(i, { byCpm: !it.byCpm })}>{it.byCpm ? "Informar valor total dos pontos" : "Informar valor do milheiro"}</button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Valor pago na emissão (R$)" required><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={it.cashCost} onChange={(e) => setItem(i, { cashCost: e.target.value })} aria-label={`Valor pago na emissão do item ${i + 1}`} /></Field>
                <Field label="Valor da venda (R$)" required><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={it.price} onChange={(e) => setItem(i, { price: e.target.value })} aria-label={`Valor da venda do item ${i + 1}`} /></Field>
              </div>
            )}

            <Collapsible icon={<Receipt className="h-4 w-4" />} title="Taxas e custos repassados" subtitle="Valores pagos por você e cobrados do cliente" open={it.open.costs} onToggle={() => setItem(i, { open: { ...it.open, costs: !it.open.costs } })} right={!it.open.costs && itemCosts(it) > 0 ? <span className="text-sm font-semibold tabular-nums">{fmtBRL(itemCosts(it))}</span> : undefined}>
              <div className="space-y-2">
                {it.costs.map((c, k) => {
                  const draft = k === it.costs.length - 1;
                  const upd = (patch: Partial<CostRow>) => {
                    const next = it.costs.map((x, j) => (j === k ? { ...x, ...patch } : x));
                    // Preencher a última linha cria uma nova linha em branco (como na referência)
                    setItem(i, { costs: next.at(-1)!.amount.trim() ? [...next, emptyCost()] : next });
                  };
                  return (
                    <div key={k} className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1.3fr_1fr_1.3fr_auto]">
                      <Field label="Tipo"><select className="input" value={c.type} onChange={(e) => upd({ type: e.target.value })} aria-label={`Tipo do custo ${k + 1} do item ${i + 1}`}>{COSTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                      <Field label="Valor"><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={c.amount} onChange={(e) => upd({ amount: e.target.value })} aria-label={`Valor do custo ${k + 1} do item ${i + 1}`} /></Field>
                      <Field label="Cartão"><select className="input" value={c.cardId} onChange={(e) => upd({ cardId: e.target.value })} aria-label={`Cartão do custo ${k + 1} do item ${i + 1}`}><option value="">Selecione o cartão</option>{cards.map((cd) => <option key={cd.id} value={cd.id}>{cd.name}</option>)}</select></Field>
                      <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => setItem(i, { costs: draft ? [...it.costs.slice(0, -1), emptyCost()] : it.costs.filter((_, j) => j !== k) })} aria-label={draft ? "Limpar novo custo" : `Remover custo ${k + 1}`}>{draft ? <Eraser className="h-4 w-4" /> : <X className="h-4 w-4" />}</button>
                    </div>
                  );
                })}
              </div>
            </Collapsible>

            <Collapsible icon={<Users className="h-4 w-4" />} title="Cliente e reserva" subtitle="Quem comprou e o localizador" open={it.open.client} onToggle={() => setItem(i, { open: { ...it.open, client: !it.open.client } })}>
              <div className="space-y-3">
                <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label={`Tipo de cliente do item ${i + 1}`}>
                  {([["FINAL", "Cliente final"], ["AGENCY", "Agência"]] as const).map(([k, l]) => (
                    <button key={k} type="button" role="tab" aria-selected={it.clientType === k} onClick={() => setItem(i, { clientType: k, customerIds: [] })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${it.clientType === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{l}</button>
                  ))}
                </div>
                <Field label="Clientes"><CustomerPicker customers={customers} kind={it.clientType} value={it.customerIds} onChange={(ids) => setItem(i, { customerIds: ids })} label={`Clientes do item ${i + 1}`} /></Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Quantidade de passageiros" required={it.kind === "FLIGHT"}><input className="input" type="number" min={1} max={99} placeholder="Informe o número de passageiros" value={it.passengers} onChange={(e) => setItem(i, { passengers: e.target.value })} aria-label={`Quantidade de passageiros do item ${i + 1}`} /></Field>
                  <Field label="Localizador"><input className="input" maxLength={40} placeholder="Informe o localizador da reserva" value={it.reservation} onChange={(e) => setItem(i, { reservation: e.target.value.toUpperCase() })} aria-label={`Localizador do item ${i + 1}`} /></Field>
                </div>
              </div>
            </Collapsible>

            {it.kind !== "OTHER" && (
              <Collapsible icon={<Plane className="h-4 w-4" />} title={it.kind === "HOTEL" ? "Hospedagem" : it.kind === "CAR" ? "Locação" : "Viagem"} subtitle={it.kind === "HOTEL" ? "Entrada e saída" : it.kind === "CAR" ? "Retirada e devolução" : "Trecho e datas"} open={it.open.travel} onToggle={() => setItem(i, { open: { ...it.open, travel: !it.open.travel } })}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {TRAVEL.includes(it.kind) && <AirportField label="Origem" value={it.origin} onChange={(v) => setItem(i, { origin: v })} />}
                  {TRAVEL.includes(it.kind) && <AirportField label="Destino" value={it.destination} onChange={(v) => setItem(i, { destination: v })} />}
                  <Field label={it.kind === "HOTEL" ? "Entrada" : it.kind === "CAR" ? "Retirada" : "Ida"}><input className="input" type="date" value={it.departure} onChange={(e) => setItem(i, { departure: e.target.value })} /></Field>
                  <Field label={it.kind === "HOTEL" ? "Saída" : it.kind === "CAR" ? "Devolução" : "Volta"}><input className="input" type="date" value={it.ret} onChange={(e) => setItem(i, { ret: e.target.value })} /></Field>
                </div>
              </Collapsible>
            )}

            <Collapsible icon={<FileText className="h-4 w-4" />} title="Outros detalhes" subtitle="Descrição e observações" open={it.open.other} onToggle={() => setItem(i, { open: { ...it.open, other: !it.open.other } })}>
              <div className="space-y-3">
                <Field label="Descrição"><input className="input" maxLength={200} placeholder="Informe a descrição" value={it.description} onChange={(e) => setItem(i, { description: e.target.value })} aria-label={`Descrição do item ${i + 1}`} /></Field>
                <Field label="Observações"><textarea className="input min-h-[70px] py-2" maxLength={2000} placeholder="Informe as observações" value={it.observation} onChange={(e) => setItem(i, { observation: e.target.value })} aria-label={`Observações do item ${i + 1}`} /></Field>
              </div>
            </Collapsible>
          </section>
        ))}

        <div className="relative">
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-light hover:underline" onClick={() => setAddMenu(!addMenu)} aria-expanded={addMenu} disabled={items.length >= 20}><Plus className="h-4 w-4" />Adicionar item à venda</button>
          {addMenu && (
            <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-56 rounded-xl border border-line bg-panel2 p-1 shadow-xl">
              {KINDS.map(([k, l]) => <button key={k} type="button" role="menuitem" className="flex w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-line" onClick={() => { setItems([...items, newItem(k)]); setAddMenu(false); setDirty(true); }}>{l}</button>)}
            </div>
          )}
        </div>

        <Collapsible icon={<Paperclip className="h-4 w-4" />} title="Anexos" subtitle="Comprovantes, contratos e cartões de embarque" open={filesOpen} onToggle={() => setFilesOpen(!filesOpen)} right={<span className="text-xs text-muted">{fmtSize(filesSize || 0)} / 10,0 MB · {files.length} / {MAX_FILES} arquivos</span>}>
          <div className="space-y-3">
            <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }} disabled={files.length >= MAX_FILES}
              className={`flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center ${drag ? "border-accent-light bg-accent-soft/30" : "border-line hover:bg-panel2/60"} disabled:opacity-50`}>
              <Upload className="h-5 w-5 text-muted" />
              <span className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</span>
              <span className="text-xs text-muted">PNG, JPEG, WEBP, HEIC, PDF</span>
              <span className="text-xs text-muted">{files.length} de {MAX_FILES} arquivos · {fmtSize(filesSize || 0)} de 10,0 MB</span>
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Selecionar anexos da venda" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Anexos da venda">
                {files.map((f, k) => <li key={k} className="flex items-center gap-2 px-3 py-2 text-sm"><FileText className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{fmtSize(f.size)}</span><button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setFiles(files.filter((_, j) => j !== k))} aria-label={`Remover ${f.name}`}><X className="h-4 w-4" /></button></li>)}
              </ul>
            )}
            <p className="text-xs text-muted">Os anexos serão enviados ao salvar a venda.</p>
          </div>
        </Collapsible>

        {(acc || sup) && points + total > 0 && (
          <p className="rounded-xl bg-panel2 px-4 py-3 text-sm text-muted">
            Resultado estimado: <b className={estimate >= 0 ? "text-ok" : "text-bad"}>{fmtBRL(estimate)}</b>
            {points > 0 && available != null && points > available && <span className="text-red-300"> · Saldo insuficiente ({fmtPts(available)} pontos)</span>}
          </p>
        )}
      </form>
      <datalist id="sale-airports">{AIRPORTS.map((a) => <option key={a.code} value={`${a.code} — ${a.city} (${a.name})`} />)}</datalist>
    </Modal>
  );
}
