"use client";
// Vendas: lista (Data, Programa, Descrição, Pontos, Valor, Resultado, Ações), detalhes e a aba Clientes.
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Search, MoreHorizontal, Eye, Trash2, HandCoins, Users, Pencil, FileText, X, Eraser, ArrowDown, ArrowUp, ChevronsUpDown, Plus, Undo2, CircleCheck, Tag, Wallet, Columns3, Handshake, UserCheck } from "lucide-react";
import { api, today } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, fmtDateTime, fmtPts, parseBRLToCents } from "@/lib/format";
import { airportLabel } from "@/domain/airports";
import { ProgramDot } from "@/components/stat";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { maskDoc } from "../programs/holder-dialog";
import { DateRangePicker, rangeLabel, type DayRange } from "@/components/date-range";
import { describePartner } from "@/domain/team";
import { SaleDialog, type SaleAccount, type SaleSupplier, type SaleCustomer, type SaleCard } from "./sale-dialog";
import type { SaleView } from "@/server/services/sales";

const COST_LABELS: Record<string, string> = { TAXA_EMBARQUE: "Taxa de embarque", IOF: "IOF", BAGAGEM: "Bagagem", ASSENTO: "Assento", COMPLETAR_PONTOS: "Completar pontos", OUTROS: "Outros" };

export function SalesClient({ sales, accounts, suppliers, customers, cards, sp, range, tags, partners, members = [], editSale }: { partners: { id: string; name: string; mode: string; value: number }[]; members?: { id: string; name: string; issuer: boolean }[]; sales: SaleView[]; accounts: SaleAccount[]; suppliers: SaleSupplier[]; customers: SaleCustomer[]; cards: SaleCard[]; sp: Record<string, string>; range: DayRange; tags: string[]; editSale?: SaleView | null }) {
  const router = useRouter();
  const nav = useNav();
  const params = useSearchParams();
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<SaleView | null>(null);
  const [editingSale, setEditingSale] = useState<SaleView | null>(editSale ?? null);
  const [menu, setMenu] = useState<{ s: SaleView; top: number; right: number } | null>(null);
  const [refunding, setRefunding] = useState<SaleView | null>(null);
  const [tagging, setTagging] = useState<SaleView | null>(null);
  const [partnering, setPartnering] = useState<SaleView | null>(null);
  const [issuing, setIssuing] = useState<SaleView | null>(null);
  const [cols, setCols] = useColumns();
  const on = (k: ColKey) => cols.includes(k);
  // prazo de reembolso (24h depois da emissão): o relógio da tela anda sozinho a cada minuto
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);
  const refundOpen = (s: SaleView) => !!s.refundUntil && new Date(s.refundUntil).getTime() > now;

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
  async function receive(s: SaleView, kind: "miles" | "tax") {
    const what = kind === "miles" ? `o estorno das ${fmtPts(s.refund?.points ?? 0)} milhas` : `o estorno da taxa (${fmtBRL(s.refund?.taxCents ?? 0)})`;
    const ok = await confirmDialog({ title: "Estorno recebido?", body: `Marcar ${what} como recebido hoje?${kind === "miles" ? " As milhas saem do bloqueio e entram no saldo da conta." : ""}`, confirmLabel: "Marcar recebido" });
    if (!ok) return;
    const r = await api(`/api/sales/${s.id}/refund/receipt`, "POST", { kind, date: today() });
    if (!r.ok) return toast(r.erro, "error");
    toast(kind === "miles" ? "Estorno das milhas recebido" : "Estorno da taxa recebido");
    refreshSafe(router);
  }
  async function setPaid(s: SaleView, paid: boolean) {
    const ok = await confirmDialog(paid
      ? { title: "Cliente pagou?", body: `Marcar ${fmtBRL(s.totalCents)} como recebido hoje?`, confirmLabel: "Marcar pago" }
      : { title: "Voltar para a receber?", body: "A venda volta a aparecer como não paga.", confirmLabel: "Voltar" });
    if (!ok) return;
    const r = await api(`/api/sales/${s.id}/payment`, "POST", { paid, date: paid ? today() : undefined });
    if (!r.ok) return toast(r.erro, "error");
    toast(paid ? "Pagamento registrado" : "Venda voltou para a receber");
    refreshSafe(router);
  }
  async function undo(s: SaleView) {
    const ok = await confirmDialog({ title: "Desfazer reembolso?", body: "As milhas saem da conta de novo e a venda volta a contar no faturamento.", confirmLabel: "Desfazer" });
    if (!ok) return;
    const r = await api(`/api/sales/${s.id}/refund`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Reembolso desfeito");
    refreshSafe(router);
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap gap-2">
        <DateRangePicker value={range} onChange={(r) => go(r ? { from: r.from, to: r.to, periodo: null } : { from: null, to: null, periodo: "tudo" })} />
        <form className="relative min-w-[220px] flex-1" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") || "") || null }); }}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" name="q" placeholder="Buscar por descrição, localizador, cliente ou aeroporto" defaultValue={params.get("q") ?? ""} key={params.get("q") ?? ""} aria-label="Buscar vendas" />
        </form>
        <select className="input w-full sm:w-56" value={params.get("customerId") ?? ""} onChange={(e) => go({ customerId: e.target.value || null })} aria-label="Filtrar por cliente">
          <option value="">Todos os clientes</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input w-full sm:w-44" value={params.get("pago") ?? ""} onChange={(e) => go({ pago: e.target.value || null })} aria-label="Filtrar por pagamento">
          <option value="">Pagamento: todos</option>
          <option value="nao">A receber</option>
          <option value="sim">Pagos</option>
        </select>
        {tags.length > 0 && (
          <select className="input w-full sm:w-44" value={params.get("tag") ?? ""} onChange={(e) => go({ tag: e.target.value || null })} aria-label="Filtrar por etiqueta">
            <option value="">Todas as etiquetas</option>
            {tags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <ColumnPicker value={cols} onChange={setCols} />
        <button className="btn-primary" onClick={() => setCreating(true)} disabled={accounts.length === 0 && suppliers.length === 0}><Plus className="h-4 w-4" />Registrar venda</button>
      </div>

      {sales.length === 0 ? (
        <Empty title={params.get("q") || params.get("customerId") || params.get("pago") || params.get("tag") || range ? "Nenhuma venda" : "Nenhuma venda cadastrada"} icon={<HandCoins className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{params.get("q") || params.get("customerId") || params.get("pago") || params.get("tag") || range ? `Nenhuma venda ${range ? `em ${rangeLabel(range)}` : "com esses filtros"}.` : "Comece registrando sua primeira venda."}</p>
          <button className="btn-primary" onClick={() => setCreating(true)}>Registrar venda</button>
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>{sortHeader("occurredAt", "Data")}</th><th>Programa</th><th>Descrição</th>
                  {on("loc") && <th>Localizador</th>}
                  {on("cliente") && <th>Cliente</th>}
                  {on("tags") && <th>Etiquetas</th>}
                  <th className="text-right">{sortHeader("points", "Pontos")}</th>
                  {on("milheiro") && <th className="text-right" title="Preço do milheiro vendido (valor dos pontos ÷ pontos × 1.000)">Milheiro</th>}
                  {on("cpfs") && <th className="text-right" title="CPFs emitidos">CPFs</th>}
                  <th className="text-right">{sortHeader("totalCents", "Valor")}</th>
                  {on("custo") && <th className="text-right" title="Milhas, emissões pagas e taxas repassadas">Custo total</th>}
                  {on("custoMilhas") && <th className="text-right" title="Custo dos pontos usados">Custo milhas</th>}
                  <th className="text-right">Lucro</th>
                  {on("margem") && <th className="text-right" title="Lucro ÷ preço de venda">Margem</th>}
                  {on("roe") && <th className="text-right" title="Lucro ÷ custo investido">ROE</th>}
                  {on("lucroCpf") && <th className="text-right">Lucro/CPF</th>}
                  {on("pgto") && <th>Pgto cliente</th>}
                  <th className="w-16 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s) => (
                  <tr key={s.id} className={s.refund ? "bg-amber-500/5" : undefined}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(s.date)}{s.refund && <span className="block text-xs text-amber-300" title={`Reembolsada em ${fmtDate(s.refund.date)}`}>Reembolsada{refundWaiting(s) && <span className="text-muted"> · aguardando estorno {refundWaiting(s)}</span>}</span>}{refundOpen(s) && <span className="block text-xs text-muted" title="Prazo para reembolso: 24 horas depois da emissão">Reembolso até {fmtDateTime(s.refundUntil!)} ({timeLeft(s.refundUntil!, now)})</span>}</td>
                    <td className="max-w-[180px]"><span className="flex items-center gap-2"><ProgramDot color={s.color} /><span className="truncate font-medium">{s.program}</span></span></td>
                    <td className="max-w-[260px]">
                      <button type="button" className="block max-w-full truncate text-left hover:underline" onClick={() => setViewing(s)}>{s.description}</button>
                      {!on("cliente") && s.customers.length > 0 && <span className="block truncate text-xs text-muted">{s.customers.join(", ")}</span>}
                    </td>
                    {on("loc") && <td className="whitespace-nowrap font-mono text-xs">{s.reservations.join(", ") || "-"}</td>}
                    {on("cliente") && <td className="max-w-[180px] truncate" title={s.customers.join(", ")}>{s.customers.join(", ") || "-"}</td>}
                    {on("tags") && <td className="max-w-[200px]"><button type="button" className="flex flex-wrap gap-1 text-left" onClick={() => setTagging(s)} aria-label={`Etiquetas da venda ${s.description}`}>{s.tags.length ? s.tags.map((t) => <span key={t} className="rounded-full bg-line px-2 py-0.5 text-xs">{t}</span>) : <span className="text-xs text-muted hover:text-white">+ etiqueta</span>}</button></td>}
                    <td className="text-right tabular-nums">{s.refund ? <span className="text-muted line-through" title="Milhas devolvidas à conta">{s.refund.points ? fmtPts(s.refund.points) : "-"}</span> : s.points ? fmtPts(s.points) : "-"}</td>
                    {on("milheiro") && <td className="text-right tabular-nums">{s.points > 0 && s.pointsValueCents > 0 ? fmtBRL(Math.round((s.pointsValueCents * 1000) / s.points)) : "-"}</td>}
                    {on("cpfs") && <td className="text-right tabular-nums">{s.cpfs || "-"}</td>}
                    <td className="text-right tabular-nums" title={s.refund ? "Taxa de administração do reembolso" : undefined}>{fmtBRL(s.totalCents)}</td>
                    {on("custo") && <td className="text-right tabular-nums">{fmtBRL(s.costCents)}</td>}
                    {on("custoMilhas") && <td className="text-right tabular-nums">{s.milesCostCents ? fmtBRL(s.milesCostCents) : "-"}</td>}
                    <td className={`text-right font-semibold tabular-nums ${s.resultCents >= 0 ? "text-ok" : "text-bad"}`}>{fmtBRL(s.resultCents)}{s.partner && <span className="block text-[11px] font-normal text-muted" title={`Comissão de ${s.partner.name} já descontada`}>− {fmtBRL(s.partner.commissionCents)} {s.partner.name}</span>}</td>
                    {on("margem") && <td className="text-right tabular-nums">{s.marginPct == null ? "-" : `${s.marginPct.toLocaleString("pt-BR")}%`}</td>}
                    {on("roe") && <td className="text-right tabular-nums">{s.roePct == null ? "-" : `${s.roePct.toLocaleString("pt-BR")}%`}</td>}
                    {on("lucroCpf") && <td className="text-right tabular-nums">{s.cpfs > 0 ? fmtBRL(Math.round(s.resultCents / s.cpfs)) : "-"}</td>}
                    {on("pgto") && <td className="whitespace-nowrap">{s.paidAt
                      ? <button type="button" onClick={() => setPaid(s, false)} title="Clique para voltar para a receber" className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Pago {fmtDate(s.paidAt).slice(0, 5)}</button>
                      : <button type="button" onClick={() => setPaid(s, true)} title="Clique quando o cliente pagar" className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">A receber</button>}</td>}
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
          {!menu.s.refund && <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setEditingSale(menu.s); setMenu(null); }}><Pencil className="h-4 w-4" />Editar</button>}
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-line" onClick={() => { const s = menu.s; setMenu(null); setPaid(s, !s.paidAt); }}><Wallet className="h-4 w-4 shrink-0" />{menu.s.paidAt ? "Voltar para a receber" : "Cliente pagou"}</button>
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setTagging(menu.s); setMenu(null); }}><Tag className="h-4 w-4" />Etiquetas</button>
          {!menu.s.refund && <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setPartnering(menu.s); setMenu(null); }}><Handshake className="h-4 w-4" />Parceiro</button>}
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setIssuing(menu.s); setMenu(null); }}><UserCheck className="h-4 w-4" />Emissores</button>
          {menu.s.refund && !menu.s.refund.milesReceivedAt && <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-line" onClick={() => { const s = menu.s; setMenu(null); receive(s, "miles"); }}><CircleCheck className="h-4 w-4 shrink-0" />Milhas estornadas</button>}
          {menu.s.refund && !menu.s.refund.taxReceivedAt && <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-line" onClick={() => { const s = menu.s; setMenu(null); receive(s, "tax"); }}><CircleCheck className="h-4 w-4 shrink-0" />Taxa estornada</button>}
          {menu.s.refund
            ? <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { const s = menu.s; setMenu(null); undo(s); }}><Undo2 className="h-4 w-4" />Desfazer reembolso</button>
            : refundOpen(menu.s)
              ? <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line" onClick={() => { setRefunding(menu.s); setMenu(null); }}><Undo2 className="h-4 w-4" />Reembolsar</button>
              : <button role="menuitem" disabled className="flex w-full cursor-not-allowed items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-muted" title={menu.s.refundUntil ? `O prazo de 24 horas acabou em ${fmtDateTime(menu.s.refundUntil)}` : undefined}><Undo2 className="h-4 w-4 shrink-0" />Prazo de reembolso encerrado</button>}
          <button role="menuitem" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-300 hover:bg-line" onClick={() => { const s = menu.s; setMenu(null); remove(s); }}><Trash2 className="h-4 w-4" />Excluir</button>
        </div>
      )}
      {creating && <SaleDialog accounts={accounts} suppliers={suppliers} customers={customers} cards={cards} onClose={() => setCreating(false)} />}
      {editingSale && <SaleDialog key={editingSale.id} editing={editingSale} accounts={accounts} suppliers={suppliers} customers={customers} cards={cards} onClose={() => { setEditingSale(null); if (sp.edit) nav("/app/sales", { replace: true }); }} />}
      {viewing && <SaleDetails sale={viewing} onClose={() => setViewing(null)} />}
      {refunding && <RefundDialog sale={refunding} onClose={() => setRefunding(null)} />}
      {tagging && <TagsDialog sale={tagging} known={tags} onClose={() => setTagging(null)} />}
      {partnering && <PartnerDialog sale={partnering} partners={partners} onClose={() => setPartnering(null)} />}
      {issuing && <IssuersDialog sale={issuing} members={members} onClose={() => setIssuing(null)} />}
    </>
  );
}

/** O que ainda falta a companhia estornar: "das milhas e da taxa", "das milhas", "da taxa" (ou vazio). */
function refundWaiting(s: SaleView) {
  if (!s.refund) return "";
  const miles = !s.refund.milesReceivedAt, tax = !s.refund.taxReceivedAt;
  return miles && tax ? "das milhas e da taxa" : miles ? "das milhas" : tax ? "da taxa" : "";
}

/** Tempo que falta para o fim do prazo: "5h 20min", "40min". */
function timeLeft(until: string, now: number) {
  const min = Math.max(0, Math.round((new Date(until).getTime() - now) / 60_000));
  const h = Math.floor(min / 60);
  return h ? `faltam ${h}h ${String(min % 60).padStart(2, "0")}min` : `faltam ${min}min`;
}

/** R$ 100 por CPF emitido: o CPF fica gasto na conta mesmo com o reembolso. */
const REFUND_FEE_PER_CPF = "100,00";

/** Reembolso: as milhas voltam para a conta, a taxa de embarque volta para o cliente e só a taxa de
 *  administração fica no faturamento. */
function RefundDialog({ sale: s, onClose }: { sale: SaleView; onClose: () => void }) {
  const router = useRouter();
  const cpfs = Math.max(1, s.cpfs);
  const [perCpf, setPerCpf] = useState(REFUND_FEE_PER_CPF);
  const [date, setDate] = useState(() => { const t = today(); return t < s.date.slice(0, 10) ? s.date.slice(0, 10) : t; });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const perCpfCents = perCpf.trim() ? parseBRLToCents(perCpf) : 0;
  const feeCents = perCpfCents == null ? null : perCpfCents * cpfs;
  const passCents = s.items.reduce((t, i) => t + i.costs.reduce((u, c) => u + c.amountCents, 0), 0);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (feeCents == null || feeCents < 0) return setErro("Taxa de administração inválida");
    setBusy(true);
    const r = await api(`/api/sales/${s.id}/refund`, "POST", { feeCents, date });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Venda reembolsada");
    onClose();
    refreshSafe(router);
  }
  const line = (label: string, value: React.ReactNode) => <div className="flex items-start justify-between gap-4 py-1.5 text-sm"><span className="text-muted">{label}</span><span className="text-right font-medium tabular-nums">{value}</span></div>;
  return (
    <Modal open onClose={onClose} title="Reembolsar venda" footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="refund-form" className="btn-primary" disabled={busy}>Reembolsar</button></>}>
      <form id="refund-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">{s.description} · {s.program}</p>
        {s.refundUntil && <p className="text-sm">Prazo para reembolsar: até <b>{fmtDateTime(s.refundUntil)}</b> (24 horas depois da emissão).</p>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Taxa de administração por CPF" required><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={perCpf} onChange={(e) => setPerCpf(e.target.value)} aria-label="Taxa de administração por CPF" /></Field>
          <Field label="Data do reembolso" required><input className="input" type="date" min={s.date.slice(0, 10)} value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data do reembolso" /></Field>
        </div>
        <div className="divide-y divide-line rounded-xl border border-line px-3">
          {line(s.origin === "OWN" ? "Milhas bloqueadas até o estorno da companhia" : "Milhas que voltam para o fornecedor no estorno", s.points ? fmtPts(s.points) : "-")}
          {passCents > 0 && line("Taxa de embarque e repasses (estorno da companhia, voltam para o cliente)", fmtBRL(passCents))}
          {line("Sai do faturamento", fmtBRL(s.totalCents))}
          {line(`Taxa de administração (${cpfs} ${cpfs === 1 ? "CPF" : "CPFs"} × ${fmtBRL(perCpfCents ?? 0)})`, fmtBRL(feeCents ?? 0))}
          {line("Fica no faturamento (lucro)", <span className="text-ok">{fmtBRL(feeCents ?? 0)}</span>)}
        </div>
        <p className="text-xs text-muted">Depois, marque no menu da venda quando a companhia estornar as milhas e a taxa. Os CPFs usados na emissão continuam gastos no limite da conta; por isso a taxa é cobrada por CPF.</p>
      </form>
    </Modal>
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
        {s.refund && (
          <Alert kind="info">
            Reembolsada em {fmtDate(s.refund.date)}. No faturamento fica só a taxa de administração de {fmtBRL(s.refund.feeCents)} (a venda era de {fmtBRL(s.refund.totalCents)}).
            <span className="mt-1 block">Milhas ({fmtPts(s.refund.points)}): {s.refund.milesReceivedAt ? `estornadas em ${fmtDate(s.refund.milesReceivedAt)}` : "aguardando estorno da companhia (bloqueadas)"}</span>
            {s.refund.taxCents > 0 && <span className="block">Taxa ({fmtBRL(s.refund.taxCents)}): {s.refund.taxReceivedAt ? `estornada em ${fmtDate(s.refund.taxReceivedAt)}` : "aguardando estorno da companhia"}</span>}
          </Alert>
        )}
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

/** Colunas que dá para mostrar ou esconder; a escolha fica salva neste navegador. */
const COLUMNS = [
  { key: "loc", label: "Localizador", on: true },
  { key: "cliente", label: "Cliente", on: true },
  { key: "tags", label: "Etiquetas", on: true },
  { key: "milheiro", label: "Milheiro", on: true },
  { key: "cpfs", label: "CPFs", on: false },
  { key: "custo", label: "Custo total", on: true },
  { key: "custoMilhas", label: "Custo milhas", on: false },
  { key: "margem", label: "Margem", on: true },
  { key: "roe", label: "ROE", on: true },
  { key: "lucroCpf", label: "Lucro/CPF", on: true },
  { key: "pgto", label: "Pgto cliente", on: true },
] as const;
type ColKey = (typeof COLUMNS)[number]["key"];
const COLS_KEY = "mm:sales-cols";
const DEFAULT_COLS: ColKey[] = COLUMNS.filter((c) => c.on).map((c) => c.key);

function useColumns(): [ColKey[], (c: ColKey[]) => void] {
  const [cols, setCols] = useState<ColKey[]>(DEFAULT_COLS);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(COLS_KEY) ?? "null");
      if (Array.isArray(saved)) setCols(saved.filter((k): k is ColKey => COLUMNS.some((c) => c.key === k)));
    } catch {}
  }, []);
  return [cols, (c) => { setCols(c); try { localStorage.setItem(COLS_KEY, JSON.stringify(c)); } catch {} }];
}

function ColumnPicker({ value, onChange }: { value: ColKey[]; onChange: (c: ColKey[]) => void }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);
  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="btn-ghost h-full" onClick={() => setOpen((o) => !o)} aria-expanded={open}><Columns3 className="h-4 w-4" />Colunas</button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-2 w-52 rounded-xl border border-line bg-panel2 p-2 shadow-xl shadow-black/40">
          {COLUMNS.map((c) => (
            <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-line">
              <input type="checkbox" checked={value.includes(c.key)} onChange={(e) => onChange(e.target.checked ? COLUMNS.map((x) => x.key).filter((k) => k === c.key || value.includes(k)) : value.filter((k) => k !== c.key))} />
              {c.label}
            </label>
          ))}
          <button type="button" className="mt-1 w-full rounded-lg px-2 py-1.5 text-left text-xs text-muted hover:bg-line" onClick={() => onChange(DEFAULT_COLS)}>Voltar ao padrão</button>
        </div>
      )}
    </div>
  );
}

/** Etiquetas livres da venda: digite e aperte Enter, ou escolha uma já usada. */
function TagsDialog({ sale: s, known, onClose }: { sale: SaleView; known: string[]; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<string[]>(s.tags);
  const [text, setText] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const add = (t: string) => { const v = t.trim(); if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) setList([...list, v]); setText(""); };
  async function save() {
    const all = text.trim() ? [...list, text.trim()] : list;
    setBusy(true);
    const r = await api(`/api/sales/${s.id}/tags`, "PUT", { tags: all });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Etiquetas salvas");
    onClose();
    refreshSafe(router);
  }
  const suggest = known.filter((k) => !list.some((x) => x.toLowerCase() === k.toLowerCase()) && k.toLowerCase().includes(text.trim().toLowerCase()));
  return (
    <Modal open onClose={onClose} title="Etiquetas da venda" size="sm" icon={<Tag className="h-5 w-5" />}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save} disabled={busy}>Salvar</button></>}>
      <div className="space-y-3">
        <p className="truncate text-sm text-muted">{s.description}</p>
        <div className="flex flex-wrap gap-1">
          {list.map((t) => <button key={t} type="button" className="inline-flex items-center gap-1 rounded-full bg-line px-2 py-0.5 text-xs" onClick={() => setList(list.filter((x) => x !== t))} aria-label={`Tirar a etiqueta ${t}`}>{t}<X className="h-3 w-3" /></button>)}
          {list.length === 0 && <span className="text-xs text-muted">Nenhuma etiqueta</span>}
        </div>
        <Field label="Nova etiqueta">
          <input className="input" value={text} maxLength={30} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(text); } }} placeholder="Ex.: urgente, agência X" aria-label="Nova etiqueta" autoFocus />
        </Field>
        {suggest.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggest.slice(0, 12).map((t) => <button key={t} type="button" className="rounded-full border border-line px-2 py-0.5 text-xs hover:bg-line" onClick={() => add(t)}>+ {t}</button>)}
          </div>
        )}
        {erro && <Alert kind="error">{erro}</Alert>}
      </div>
    </Modal>
  );
}

/** Quem emitiu a venda (membros da Equipe): base da aba Equipe em Métricas. Com vários, o resultado é rateado. */
function IssuersDialog({ sale: s, members, onClose }: { sale: SaleView; members: { id: string; name: string; issuer: boolean }[]; onClose: () => void }) {
  const router = useRouter();
  const [ids, setIds] = useState<string[]>(s.issuerIds ?? []);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  // quem emite passagens aparece primeiro; quem já está marcado continua na lista mesmo sem a marca de emissor
  const list = [...members].sort((a, b) => Number(b.issuer) - Number(a.issuer) || a.name.localeCompare(b.name));
  async function save() {
    setBusy(true);
    const r = await api(`/api/sales/${s.id}/issuers`, "POST", { memberIds: ids });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(ids.length ? "Emissores salvos" : "Emissores tirados da venda");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title="Emissores da venda" size="sm" icon={<UserCheck className="h-5 w-5" />}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy} onClick={save}>Salvar</button></>}>
      <div className="space-y-3">
        <p className="truncate text-sm text-muted">{s.description}</p>
        {erro && <Alert kind="error">{erro}</Alert>}
        {list.length === 0 ? <p className="text-sm text-muted">Ninguém na equipe ainda. Cadastre em Gestão › Equipe.</p> : (
          <div className="space-y-1" role="group" aria-label="Emissores">
            {list.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-panel2">
                <input type="checkbox" checked={ids.includes(m.id)} onChange={(e) => setIds((x) => (e.target.checked ? [...x, m.id] : x.filter((y) => y !== m.id)))} />
                <span className="text-sm">{m.name}</span>
                {m.issuer && <span className="ml-auto rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">emissor</span>}
              </label>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Aparece em Métricas › Equipe. Com mais de um emissor, a venda conta em partes iguais para cada um.</p>
      </div>
    </Modal>
  );
}

/** Parceiro que trouxe a venda: a comissão pela regra dele sai do lucro. */
function PartnerDialog({ sale: s, partners, onClose }: { sale: SaleView; partners: { id: string; name: string; mode: string; value: number }[]; onClose: () => void }) {
  const router = useRouter();
  const [partnerId, setPartnerId] = useState(s.partner?.id ?? "");
  const [erro, setErro] = useState("");
  async function save() {
    const r = await api(`/api/sales/${s.id}/partner`, "POST", { partnerId: partnerId || null });
    if (!r.ok) return setErro(r.erro);
    toast(partnerId ? "Parceiro ligado à venda" : "Parceiro tirado da venda");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title="Parceiro da venda" size="sm" icon={<Handshake className="h-5 w-5" />}
      footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" onClick={save}>Salvar</button></>}>
      <div className="space-y-3">
        <p className="truncate text-sm text-muted">{s.description}</p>
        {erro && <Alert kind="error">{erro}</Alert>}
        {partners.length === 0 ? <p className="text-sm text-muted">Nenhum parceiro ativo. Cadastre em Gestão › Equipe.</p> : (
          <Field label="Parceiro">
            <select className="input" value={partnerId} onChange={(e) => setPartnerId(e.target.value)} aria-label="Parceiro">
              <option value="">Nenhum</option>
              {partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {describePartner(p.mode, p.value)}</option>)}
            </select>
          </Field>
        )}
        <p className="text-xs text-muted">A comissão é calculada agora e sai do lucro, da margem e do ROE da venda. Se a venda for editada, ela é recalculada.</p>
      </div>
    </Modal>
  );
}
