"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Pencil, Trash2, CircleCheck, Undo2, ArrowRightLeft, Repeat, Landmark, CreditCard, ChevronDown } from "lucide-react";
import { api, today } from "@/lib/api";
import { useNav, refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { cardDueDay, categoryOptions, type FinType, type Regime } from "@/domain/finance";

type Account = { id: string; name: string; kind: string; color: string; archived: boolean; initialCents: number; balanceCents: number; salesCents?: number };
type Tx = { id: string; type: string; category: string | null; amountCents: number; description: string | null; counterpart: string | null; accountId: string; account: string; accountColor: string; toAccountId: string | null; toAccount: string | null; competence: string; dueDate: string; paidAt: string | null; repeat: boolean; overdue: boolean; cardId: string | null; card: string | null; billDue: string | null };
type CardOpt = { id: string; name: string; last4: string | null; closingDay: number; dueDay: number };
const cardLabel = (c: { name: string; last4: string | null }) => (c.last4 ? `${c.name} •••• ${c.last4}` : c.name);

const TYPE_LABEL: Record<string, string> = { INCOME: "Receita", EXPENSE: "Despesa", TRANSFER: "Transferência" };
const KIND_LABEL: Record<string, string> = { BANK: "Conta bancária", CASH: "Caixa / dinheiro", WALLET: "Carteira digital", OTHER: "Outra" };
const COLORS = ["#60a5fa", "#22c55e", "#a78bfa", "#f59e0b", "#ef4444", "#f472b6", "#38bdf8", "#94a3b8"];
const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");

/* ---------------- Lançamentos ---------------- */

export function TransactionsClient({ month, regime, items, accounts, filters, cards = [] }: { month: string; regime: Regime; items: Tx[]; accounts: Account[]; filters: { tipo: string; status: string }; cards?: CardOpt[] }) {
  const router = useRouter();
  const nav = useNav();
  const params = useSearchParams();
  const [editing, setEditing] = useState<Tx | FinType | null>(null);
  const go = (patch: Record<string, string>) => {
    const u = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) v ? u.set(k, v) : u.delete(k);
    nav(`/app/financeiro?${u}`);
  };
  const income = items.filter((t) => t.type === "INCOME").reduce((s, t) => s + t.amountCents, 0);
  const expense = items.filter((t) => t.type === "EXPENSE").reduce((s, t) => s + t.amountCents, 0);

  async function paid(t: Tx, value: boolean) {
    const r = await api(`/api/finance/transactions/${t.id}/paid`, "POST", { paid: value, date: value ? today() : undefined });
    if (!r.ok) return toast(r.erro, "error");
    toast(value ? (t.type === "INCOME" ? "Marcado como recebido" : "Marcado como pago") : "Voltou a pendente");
    refreshSafe(router);
  }
  async function remove(t: Tx) {
    if (!(await confirmDialog({ title: "Excluir lançamento?", body: `${t.description || t.category || TYPE_LABEL[t.type]} · ${fmtBRL(t.amountCents)}`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/finance/transactions/${t.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Lançamento excluído");
    refreshSafe(router);
  }

  if (accounts.length === 0) {
    return (
      <Empty title="Cadastre uma conta primeiro" icon={<Landmark className="h-5 w-5" />}>
        <p className="max-w-sm text-sm text-muted">Os lançamentos saem e entram de uma conta (banco, caixa ou carteira digital).</p>
        <button className="btn-primary" onClick={() => nav("/app/financeiro?aba=contas")}>Ir para Contas</button>
      </Empty>
    );
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Tipo">
          {[["", "Tudo"], ["INCOME", "Receitas"], ["EXPENSE", "Despesas"], ["TRANSFER", "Transferências"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filters.tipo === k} onClick={() => go({ tipo: k })} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filters.tipo === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Situação">
          {[["", "Todos"], ["pago", "Realizados"], ["pendente", "Pendentes"]].map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filters.status === k} onClick={() => go({ status: k })} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${filters.status === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <span className="flex-1" />
        <button className="btn-ghost" onClick={() => setEditing("INCOME")}><Plus className="h-4 w-4" />Receita</button>
        <button className="btn-ghost" onClick={() => setEditing("TRANSFER")}><ArrowRightLeft className="h-4 w-4" />Transferência</button>
        <button className="btn-primary" onClick={() => setEditing("EXPENSE")}><Plus className="h-4 w-4" />Despesa</button>
      </div>
      <div className="card overflow-hidden">
        {items.length === 0 ? <p className="px-5 py-12 text-center text-sm text-muted">Nenhum lançamento neste mês{regime === "competencia" ? " (competência)" : ""}.</p> : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Situação</th><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th className="text-right">Valor</th><th className="w-28 text-right">Ações</th></tr></thead>
              <tbody>
                {items.map((t) => (
                  <tr key={t.id}>
                    <td>{t.paidAt ? <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">{t.type === "INCOME" ? "Recebido" : "Pago"}</span> : <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${t.overdue ? "bg-red-500/15 text-red-300" : "bg-amber-500/15 text-amber-300"}`}>{t.overdue ? "Atrasado" : "Pendente"}</span>}</td>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(t.paidAt ?? t.dueDate)}{regime === "competencia" && <span className="block text-xs text-muted">comp. {t.competence.slice(5, 7)}/{t.competence.slice(0, 4)}</span>}</td>
                    <td className="max-w-[260px]"><span className="flex items-center gap-1.5 truncate">{t.repeat && <Repeat className="h-3 w-3 shrink-0 text-muted" aria-label="Repete" />}{t.description || TYPE_LABEL[t.type]}</span>{t.counterpart && <span className="block truncate text-xs text-muted">{t.counterpart}</span>}{t.card && t.billDue && <span className="flex items-center gap-1 truncate text-xs text-muted"><CreditCard className="h-3 w-3 shrink-0" aria-hidden />{t.card} · fatura de {fmtDate(t.billDue)}</span>}</td>
                    <td className="max-w-[220px] truncate text-sm text-muted">{t.type === "TRANSFER" ? "Transferência" : t.category ?? "-"}</td>
                    <td className="whitespace-nowrap text-sm"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.accountColor }} aria-hidden />{t.account}{t.toAccount && ` → ${t.toAccount}`}</span></td>
                    <td className={`text-right font-semibold tabular-nums ${t.type === "INCOME" ? "text-ok" : t.type === "EXPENSE" ? "text-bad" : ""}`}>{t.type === "EXPENSE" ? "−" : t.type === "INCOME" ? "+" : ""}{fmtBRL(t.amountCents)}</td>
                    <td className="text-right">
                      <div className="inline-flex gap-1">
                        {t.card ? null : t.paidAt
                          ? <button className="btn-subtle h-8 w-8 px-0" onClick={() => paid(t, false)} aria-label={`Voltar a pendente: ${t.description ?? TYPE_LABEL[t.type]}`} title="Voltar a pendente"><Undo2 className="h-4 w-4" /></button>
                          : <button className="btn-subtle h-8 w-8 px-0 text-emerald-300" onClick={() => paid(t, true)} aria-label={`Marcar como ${t.type === "INCOME" ? "recebido" : "pago"}: ${t.description ?? TYPE_LABEL[t.type]}`} title={t.type === "INCOME" ? "Recebido hoje" : "Pago hoje"}><CircleCheck className="h-4 w-4" /></button>}
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(t)} aria-label={`Editar ${t.description ?? TYPE_LABEL[t.type]}`}><Pencil className="h-4 w-4" /></button>
                        <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(t)} aria-label={`Excluir ${t.description ?? TYPE_LABEL[t.type]}`}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {items.length > 0 && <p className="mt-2 text-right text-sm text-muted">Receitas <span className="tabular-nums text-emerald-300">{fmtBRL(income)}</span> · Despesas <span className="tabular-nums text-red-300">{fmtBRL(expense)}</span> · Saldo <span className="tabular-nums font-semibold text-white">{fmtBRL(income - expense)}</span></p>}
      {editing && <TxDialog tx={typeof editing === "string" ? null : editing} type={typeof editing === "string" ? editing : (editing.type as FinType)} month={month} accounts={accounts} cards={cards} onClose={() => setEditing(null)} />}
    </>
  );
}

function TxDialog({ tx, type: initialType, month, accounts, cards, onClose }: { tx: Tx | null; type: FinType; month: string; accounts: Account[]; cards: CardOpt[]; onClose: () => void }) {
  const router = useRouter();
  const t0 = today();
  const defDay = t0.slice(0, 7) === month ? t0 : `${month}-01`;
  const [type, setType] = useState<FinType>(initialType);
  const [f, setF] = useState({
    accountId: tx?.accountId ?? accounts[0]?.id ?? "",
    toAccountId: tx?.toAccountId ?? accounts.find((a) => a.id !== (tx?.accountId ?? accounts[0]?.id))?.id ?? "",
    category: tx?.category ?? "",
    amount: tx ? money(tx.amountCents) : "",
    description: tx?.description ?? "",
    counterpart: tx?.counterpart ?? "",
    dueDate: tx?.dueDate ?? defDay,
    competence: tx?.competence ?? defDay,
    paid: tx ? !!tx.paidAt : false,
    repeat: "1",
    cardId: tx?.cardId ?? "",
  });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const cats = type === "TRANSFER" ? [] : categoryOptions(type);
  // despesa no cartão: a data é a da compra; vence na fatura e fica paga quando a fatura é paga
  const card = type === "EXPENSE" ? cards.find((c) => c.id === f.cardId) : undefined;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseBRLToCents(f.amount);
    if (!amountCents || amountCents <= 0) return setErro("Informe o valor");
    setBusy(true);
    const body = {
      type, accountId: f.accountId, toAccountId: type === "TRANSFER" ? f.toAccountId : null, category: type === "TRANSFER" ? null : f.category || null,
      amountCents, description: f.description || null, counterpart: f.counterpart || null, dueDate: f.dueDate, competence: f.competence, paid: card ? false : f.paid,
      cardId: card ? card.id : null,
      ...(tx ? {} : { repeatMonths: Number(f.repeat) || 1 }),
    };
    const r = tx ? await api(`/api/finance/transactions/${tx.id}`, "PUT", body) : await api<{ created: number }>("/api/finance/transactions", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(tx ? "Lançamento atualizado" : Number(f.repeat) > 1 ? `${f.repeat} lançamentos criados` : "Lançamento criado");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal open onClose={onClose} title={tx ? "Editar lançamento" : `Nova ${TYPE_LABEL[type]!.toLowerCase()}`}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="fin-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="fin-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Tipo do lançamento">
          {(["INCOME", "EXPENSE", "TRANSFER"] as const).map((k) => <button key={k} type="button" aria-pressed={type === k} onClick={() => { setType(k); set({ category: "" }); }} className={`rounded-lg px-3 py-1 text-sm font-medium ${type === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{TYPE_LABEL[k]}</button>)}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" required><input className="input" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" aria-label="Valor" autoFocus /></Field>
          <Field label={type === "TRANSFER" ? "Da conta" : card ? "Conta que paga a fatura" : "Conta"} required>
            <select className="input" value={f.accountId} onChange={(e) => set({ accountId: e.target.value })} aria-label="Conta">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
          {type === "TRANSFER" ? (
            <Field label="Para a conta" required>
              <select className="input" value={f.toAccountId} onChange={(e) => set({ toAccountId: e.target.value })} aria-label="Conta de destino">{accounts.filter((a) => a.id !== f.accountId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
            </Field>
          ) : (
            <Field label="Categoria">
              <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">
                <option value="">Sem categoria</option>
                {cats.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
          )}
          <Field label={type === "INCOME" ? "Cliente (opcional)" : "Fornecedor (opcional)"}><input className="input" value={f.counterpart} onChange={(e) => set({ counterpart: e.target.value })} maxLength={120} aria-label="Fornecedor ou cliente" /></Field>
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} placeholder="Ex.: Aluguel do escritório" aria-label="Descrição" /></Field>
          {type === "EXPENSE" && cards.length > 0 && (
            <Field label="Pagou no cartão?" className="sm:col-span-2" hint={card ? "Entra na fatura do cartão e fica paga quando você marca a fatura como paga em Faturas" : "Escolha o cartão para a despesa entrar na fatura"}>
              <select className="input" value={f.cardId} onChange={(e) => set({ cardId: e.target.value })} aria-label="Cartão">
                <option value="">Não, sai direto da conta</option>
                {cards.map((c) => <option key={c.id} value={c.id}>{cardLabel(c)}</option>)}
              </select>
            </Field>
          )}
          <Field label={card ? "Data da compra" : type === "INCOME" ? "Data do recebimento" : "Data do pagamento"} required hint={card ? (/^\d{4}-\d{2}-\d{2}$/.test(f.dueDate) ? `Vai para a fatura que vence em ${fmtDate(cardDueDay(f.dueDate, card))}` : "") : "Vencimento, se ainda não foi pago"}><input className="input" type="date" value={f.dueDate} onChange={(e) => set({ dueDate: e.target.value })} required aria-label="Data do pagamento" /></Field>
          <Field label="Competência" required hint="Mês a que pertence"><input className="input" type="date" value={f.competence} onChange={(e) => set({ competence: e.target.value })} required aria-label="Competência" /></Field>
        </div>
        {!card && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.paid} onChange={(e) => set({ paid: e.target.checked })} />{type === "INCOME" ? "Já recebido" : type === "EXPENSE" ? "Já pago" : "Já transferido"}<span className="text-xs text-muted">(pendente não mexe no saldo)</span></label>}
        {!tx && (
          <Field label="Repetir" hint="Cria um lançamento por mês; os seguintes entram pendentes">
            <select className="input" value={f.repeat} onChange={(e) => set({ repeat: e.target.value })} aria-label="Repetir">
              <option value="1">Não repetir</option>
              {[2, 3, 6, 12, 24, 36].map((n) => <option key={n} value={n}>{n} meses</option>)}
            </select>
          </Field>
        )}
      </form>
    </Modal>
  );
}

/* ---------------- Faturas dos cartões ---------------- */

type BillRef = { kind: "fin" | "entry" | "sale"; id: string };
type BillItem = { description: string | null; amountCents: number; source: string; category: string | null; day: string; ref: BillRef | null; accountId: string };
type BillPay = { id: string; paidAt: string; amountCents: number; accountId: string | null };
type Bill = {
  cardId: string; dueDate: string; effectiveDue: string; itemsCents: number; realCents: number | null; adjustCents: number; personal: boolean; totalCents: number;
  paidCents: number; openCents: number; status: "open" | "partial" | "paid"; overdue: boolean; paidAt: string | null; payments: BillPay[]; items: BillItem[];
};
type CardBills = { id: string; name: string; last4: string | null; color: string | null; closingDay: number; dueDay: number; openCents: number; overdueCents: number; open: Bill[]; paid: Bill[] };
type AccOpt = { id: string; name: string };
const SOURCE_LABEL: Record<string, string> = { purchases: "Extrato", saleCosts: "Venda", manual: "Financeiro" };
const dueIn = (month: string, dueDay: number) => {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
  return `${month}-${String(Math.min(dueDay, last)).padStart(2, "0")}`;
};
/** Dias de compra que caem nesta fatura (do dia do fechamento anterior até a véspera do fechamento), em ordem. */
const billDays = (dueDate: string, card: { closingDay: number; dueDay: number }) => {
  const end = Date.parse(`${dueDate}T00:00:00Z`);
  return Array.from({ length: 80 }, (_, i) => new Date(end - i * 86_400_000).toISOString().slice(0, 10)).filter((d) => cardDueDay(d, card) === dueDate).reverse();
};
/** Conta sugerida para pagar a fatura: a das despesas do Financeiro lançadas nela, ou a primeira. */
const suggestedAccount = (bill: Bill | null, accounts: AccOpt[]) => bill?.items.find((i) => i.ref?.kind === "fin" && accounts.some((a) => a.id === i.accountId))?.accountId ?? accounts[0]?.id ?? "";

function BillStatus({ b }: { b: Bill }) {
  if (b.status === "paid") return <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-300">Paga</span>;
  if (b.overdue) return <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">{b.status === "partial" ? "Vencida · paga em parte" : "Vencida"}</span>;
  return <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">{b.status === "partial" ? "Paga em parte" : "Em aberto"}</span>;
}

export function CardBillsClient({ cards, accounts }: { cards: CardBills[]; accounts: AccOpt[] }) {
  const router = useRouter();
  const nav = useNav();
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<{ card: CardBills; bill: Bill | null } | null>(null);
  const [paying, setPaying] = useState<{ card: CardBills; bill: Bill; payment: BillPay | null } | null>(null);
  const [item, setItem] = useState<{ card: CardBills; bill: Bill; item: BillItem } | null>(null);
  const [adding, setAdding] = useState<{ card: CardBills; bill: Bill | null } | null>(null);
  // depois de salvar, o diálogo aberto acompanha a fatura atualizada
  const fresh = (cardId: string, dueDate: string) => cards.find((c) => c.id === cardId)?.open.concat(cards.find((c) => c.id === cardId)!.paid).find((b) => b.dueDate === dueDate) ?? null;

  async function quickPay(card: CardBills, dueDates: string[], date?: string) {
    setBusy(`${card.id}:${dueDates.join(",")}`);
    const r = await api("/api/finance/card-bills", "POST", { cardId: card.id, dueDates, paid: true, ...(date ? { date } : {}) });
    setBusy("");
    if (!r.ok) return toast(r.erro, "error");
    toast(dueDates.length > 1 ? `${dueDates.length} faturas marcadas como pagas` : "Fatura marcada como paga");
    refreshSafe(router);
  }
  async function reopen(card: CardBills, b: Bill) {
    if (!(await confirmDialog({ title: "Voltar a fatura para em aberto?", body: `Os pagamentos desta fatura (${fmtBRL(b.paidCents)}) serão apagados.`, confirmLabel: "Voltar para em aberto" }))) return;
    const r = await api("/api/finance/card-bills", "POST", { cardId: card.id, dueDates: [b.dueDate], paid: false });
    if (!r.ok) return toast(r.erro, "error");
    toast("Fatura voltou para em aberto");
    refreshSafe(router);
  }

  if (cards.length === 0) {
    return (
      <Empty title="Nenhum cartão cadastrado" icon={<CreditCard className="h-5 w-5" />}>
        <p className="max-w-md text-sm text-muted">Cadastre seus cartões com o dia de fechamento e de vencimento. Depois, escolha o cartão na linha de custo das compras do Extrato ou nas despesas do Financeiro: elas entram sozinhas na fatura certa.</p>
        <button className="btn-primary" onClick={() => nav("/app/credit-cards")}>Ir para Cartões</button>
      </Empty>
    );
  }
  const totalOpen = cards.reduce((t, c) => t + c.openCents, 0);
  const totalOverdue = cards.reduce((t, c) => t + c.overdueCents, 0);
  const row = (c: CardBills, b: Bill) => {
    const k = `${c.id}:${b.dueDate}`;
    return (
      <li key={b.dueDate} className="py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left" onClick={() => setOpen({ ...open, [k]: !open[k] })} aria-expanded={!!open[k]} aria-label={`Compras da fatura de ${fmtDate(b.effectiveDue)}`}>
            <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open[k] ? "rotate-180" : ""}`} aria-hidden />
            <span className="tabular-nums">{b.status === "paid" ? "Venceu" : "Vence"} {fmtDate(b.effectiveDue)}</span>
            <BillStatus b={b} />
            <span className="text-xs text-muted">{b.items.length} {b.items.length === 1 ? "compra" : "compras"}{b.realCents != null ? " · valor real" : ""}{b.effectiveDue !== b.dueDate ? " · vencimento alterado" : ""}</span>
          </button>
          <span className="text-right tabular-nums">
            <span className="font-semibold">{fmtBRL(b.status === "paid" ? b.totalCents : b.openCents)}</span>
            {b.status === "partial" && <span className="block text-xs text-muted">pago {fmtBRL(b.paidCents)} de {fmtBRL(b.totalCents)}</span>}
            {b.status === "paid" && b.paidAt && <span className="block text-xs text-emerald-300">paga em {fmtDate(b.paidAt)}</span>}
          </span>
          <div className="flex items-center gap-1">
            {b.status !== "paid" && (
              <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); quickPay(c, [b.dueDate], String(new FormData(e.currentTarget).get("date") || "")); }}>
                <input className="input h-8 w-auto py-0 text-xs" type="date" name="date" defaultValue={today()} aria-label={`Data do pagamento da fatura de ${fmtDate(b.effectiveDue)}`} />
                <button className="btn-primary h-8 px-3 text-xs" disabled={busy === k} title="Paga o que falta da fatura"><CircleCheck className="h-4 w-4" />Paguei</button>
              </form>
            )}
            <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing({ card: c, bill: b })} aria-label={`Editar a fatura de ${fmtDate(b.effectiveDue)}`} title="Editar fatura"><Pencil className="h-4 w-4" /></button>
            {b.status === "paid" && <button className="btn-subtle h-8 w-8 px-0" onClick={() => reopen(c, b)} aria-label={`Voltar a fatura de ${fmtDate(b.effectiveDue)} para em aberto`} title="Voltar para em aberto"><Undo2 className="h-4 w-4" /></button>}
          </div>
        </div>
        {open[k] && (
          <ul className="mt-2 space-y-1 pl-6 text-sm">
            {b.items.map((i, n) => (
              <li key={n} className="flex items-center gap-3">
                <span className="w-20 shrink-0 tabular-nums text-muted">{fmtDate(i.day)}</span>
                <span className="min-w-0 flex-1 truncate">{i.description || "Compra"}<span className="text-xs text-muted"> · {SOURCE_LABEL[i.source] ?? i.source}</span></span>
                <span className="tabular-nums">{fmtBRL(i.amountCents)}</span>
              </li>
            ))}
            {b.adjustCents !== 0 && !(b.personal && b.adjustCents > 0) && <li className="flex gap-3"><span className="w-20 shrink-0" /><span className="min-w-0 flex-1 truncate text-muted">{b.adjustCents > 0 ? "Outros gastos no cartão (valor real − compras lançadas)" : "Créditos/estornos (valor real menor que as compras)"}</span><span className="tabular-nums">{b.adjustCents > 0 ? "" : "−"}{fmtBRL(Math.abs(b.adjustCents))}</span></li>}
            {b.payments.map((p) => <li key={p.id} className="flex gap-3 text-emerald-300"><span className="w-20 shrink-0 tabular-nums">{fmtDate(p.paidAt)}</span><span className="min-w-0 flex-1 truncate">Pagamento{p.accountId ? ` · ${accounts.find((a) => a.id === p.accountId)?.name ?? "conta"}` : ""}</span><span className="tabular-nums">−{fmtBRL(p.amountCents)}</span></li>)}
            <li><button type="button" className="text-xs text-accent-light hover:underline" onClick={() => setAdding({ card: c, bill: b })}>+ Adicionar compra nesta fatura</button></li>
          </ul>
        )}
      </li>
    );
  };
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card card-pad"><p className="kicker">Em aberto nos cartões</p><p className="mt-1 text-2xl font-semibold tabular-nums">{fmtBRL(totalOpen)}</p><p className="text-xs text-muted">tudo que ainda falta pagar, somando as faturas futuras</p></div>
        <div className="card card-pad"><p className="kicker">Vencido</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${totalOverdue > 0 ? "text-red-300" : ""}`}>{fmtBRL(totalOverdue)}</p><p className="text-xs text-muted">o que falta pagar das faturas que já venceram</p></div>
      </div>
      {cards.map((c) => {
        const overdue = c.open.filter((b) => b.overdue);
        return (
          <section key={c.id} className="card card-pad" aria-label={`Faturas do cartão ${c.name}`}>
            <header className="mb-3 flex flex-wrap items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color ?? "#94a3b8" }} aria-hidden />
              <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{cardLabel(c)}</h2><p className="text-xs text-muted">fecha dia {c.closingDay} · vence dia {c.dueDay}</p></div>
              <div className="text-right"><p className="text-xs text-muted">Em aberto</p><p className="font-semibold tabular-nums">{fmtBRL(c.openCents)}</p>{c.overdueCents > 0 && <p className="text-xs tabular-nums text-red-300">{fmtBRL(c.overdueCents)} vencido</p>}</div>
              <button className="btn-ghost h-8 px-3 text-xs" onClick={() => setAdding({ card: c, bill: null })} title="Lançar uma compra feita neste cartão: a data da compra decide a fatura"><Plus className="h-4 w-4" />Compra</button>
              <button className="btn-ghost h-8 px-3 text-xs" onClick={() => setEditing({ card: c, bill: null })} title="Lançar a fatura de um mês com o valor que veio no banco"><Plus className="h-4 w-4" />Fatura</button>
            </header>
            {c.open.length === 0 ? <p className="py-3 text-sm text-muted">Nada em aberto neste cartão.</p> : <ul className="divide-y divide-line">{c.open.map((b) => row(c, b))}</ul>}
            {overdue.length > 1 && <button className="btn-ghost mt-2 h-8 text-xs" disabled={!!busy} onClick={() => quickPay(c, overdue.map((b) => b.dueDate))}><CircleCheck className="h-4 w-4" />Marcar as {overdue.length} vencidas como pagas hoje</button>}
            {c.paid.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted">Pagas recentemente</summary>
                <ul className="mt-2 divide-y divide-line">{c.paid.map((b) => row(c, b))}</ul>
              </details>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted">A fatura soma sozinha o que você passou em cada cartão: compras e custos do Extrato com o cartão escolhido na linha de custo, custos das vendas pagos no cartão e despesas do Financeiro marcadas como &quot;no cartão&quot;. Em + Compra você lança outra compra feita no cartão (soma à fatura e, se você informou o valor real, a ele também). Em ✎ você informa o valor real que veio no banco (a diferença vira &quot;outros gastos no cartão&quot;), muda o vencimento, registra pagamentos (inclusive parciais) e corrige as compras. Comprou antes do dia do fechamento, vai para a fatura do mês; no dia do fechamento ou depois, para a seguinte.</p>
      {editing && (() => {
        const bill = editing.bill ? fresh(editing.card.id, editing.bill.dueDate) ?? editing.bill : null;
        return <BillDialog card={editing.card} bill={bill} accounts={accounts} cards={cards} onClose={() => setEditing(null)} onPay={(b, p) => { setEditing(null); setPaying({ card: editing.card, bill: b, payment: p }); }} onItem={(b, i) => { setEditing(null); setItem({ card: editing.card, bill: b, item: i }); }} onAdd={(b) => { setEditing(null); setAdding({ card: editing.card, bill: b }); }} />;
      })()}
      {paying && <PaymentDialog card={paying.card} bill={fresh(paying.card.id, paying.bill.dueDate) ?? paying.bill} payment={paying.payment} accounts={accounts} onClose={() => setPaying(null)} />}
      {item && <BillItemDialog card={item.card} item={item.item} cards={cards} onClose={() => setItem(null)} />}
      {adding && <AddBillItemDialog card={cards.find((x) => x.id === adding.card.id) ?? adding.card} bill={adding.bill ? fresh(adding.card.id, adding.bill.dueDate) ?? adding.bill : null} accounts={accounts} onClose={() => setAdding(null)} />}
    </div>
  );
}

/** Editar a fatura: valor real, vencimento, pagamentos e compras. Sem fatura: lança a de um mês. */
function BillDialog({ card, bill, accounts, onClose, onPay, onItem, onAdd }: { card: CardBills; bill: Bill | null; accounts: AccOpt[]; cards: CardBills[]; onClose: () => void; onPay: (b: Bill, p: BillPay | null) => void; onItem: (b: Bill, i: BillItem) => void; onAdd: (b: Bill) => void }) {
  const router = useRouter();
  const [month, setMonth] = useState(cardDueDay(today(), card).slice(0, 7)); // a fatura das compras de hoje
  const [real, setReal] = useState(bill?.realCents != null ? money(bill.realCents) : "");
  const [due, setDue] = useState(bill?.effectiveDue ?? "");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const key = bill?.dueDate ?? dueIn(month, card.dueDay);
  const realCents = real.trim() ? parseBRLToCents(real) : null;
  const diff = bill && realCents != null ? realCents - bill.itemsCents : 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (real.trim() && realCents == null) return setErro("Valor real inválido");
    if (!bill && realCents == null) return setErro("Informe o valor da fatura");
    setBusy(true);
    const r = await api<{ movedTo?: string | null }>("/api/finance/card-bills/edit", "PUT", { cardId: card.id, dueDate: key, realCents, dueOverride: bill && due && due !== bill.dueDate ? due : null });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(r.data.movedTo ? `Fatura passada para a que vence em ${fmtDate(r.data.movedTo)}` : bill ? "Fatura atualizada" : "Fatura lançada");
    onClose();
    refreshSafe(router);
  }
  async function removePayment(p: BillPay) {
    if (!(await confirmDialog({ title: "Apagar pagamento?", body: `${fmtDate(p.paidAt)} · ${fmtBRL(p.amountCents)}`, confirmLabel: "Apagar", danger: true }))) return;
    const r = await api(`/api/finance/card-bills/payments/${p.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Pagamento apagado");
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={bill ? `Fatura ${cardLabel(card)} · ${fmtDate(bill.effectiveDue)}` : `Nova fatura · ${cardLabel(card)}`}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Fechar</button><button form="bill-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="bill-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          {bill ? (
            <Field label="Vencimento" hint={due === bill.dueDate ? "Mude só se o banco mudou o dia nesta fatura" : /^\d{4}-\d{2}-\d{2}$/.test(due) && dueIn(due.slice(0, 7), card.dueDay) === due && !bill.items.length ? `É o vencimento normal de ${due.slice(5, 7)}/${due.slice(0, 4)}: ao salvar, esta passa a ser a fatura desse mês` : `O normal deste cartão seria ${fmtDate(bill.dueDate)}`}>
              <input className="input" type="date" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Vencimento da fatura" />
            </Field>
          ) : (
            <Field label="Mês do vencimento" required hint={`Vence ${fmtDate(key)} (dia ${card.dueDay})`}>
              <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} required aria-label="Mês do vencimento" />
            </Field>
          )}
          <Field label="Valor real da fatura (R$)" required={!bill} hint={bill ? (realCents == null ? `Vazio = soma das compras lançadas (${fmtBRL(bill.itemsCents)})` : diff > 0 ? `${fmtBRL(diff)} a mais que as compras lançadas: entra como outros gastos no cartão` : diff < 0 ? `${fmtBRL(-diff)} a menos: entra como crédito/estorno` : "Igual às compras lançadas") : "O total que veio no app do banco"}>
            <input className="input tabular-nums" inputMode="decimal" value={real} onChange={(e) => setReal(e.target.value)} placeholder={bill ? fmtBRL(bill.itemsCents) : "0,00"} aria-label="Valor real da fatura" />
          </Field>
        </div>
      </form>
      {bill && (
        <div className="mt-5 space-y-4 text-sm">
          <section aria-label="Pagamentos da fatura">
            <div className="mb-2 flex items-center justify-between"><h3 className="font-semibold">Pagamentos</h3><span className="text-xs text-muted">pago {fmtBRL(bill.paidCents)} de {fmtBRL(bill.totalCents)}{bill.openCents > 0 ? ` · falta ${fmtBRL(bill.openCents)}` : ""}</span></div>
            {bill.payments.length === 0 ? <p className="text-muted">Nenhum pagamento.</p> : (
              <ul className="divide-y divide-line">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 py-1.5">
                    <span className="w-24 tabular-nums">{fmtDate(p.paidAt)}</span>
                    <span className="min-w-0 flex-1 truncate text-muted">{accounts.find((a) => a.id === p.accountId)?.name ?? "sem conta"}</span>
                    <span className="tabular-nums">{fmtBRL(p.amountCents)}</span>
                    <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => onPay(bill, p)} aria-label={`Editar pagamento de ${fmtDate(p.paidAt)}`}><Pencil className="h-4 w-4" /></button>
                    <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => removePayment(p)} aria-label={`Apagar pagamento de ${fmtDate(p.paidAt)}`}><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn-ghost mt-2 h-8 text-xs" onClick={() => onPay(bill, null)}><Plus className="h-4 w-4" />Registrar pagamento</button>
          </section>
          <section aria-label="Compras da fatura">
            <h3 className="mb-2 font-semibold">Compras ({fmtBRL(bill.itemsCents)})</h3>
            {bill.items.length === 0 ? <p className="text-muted">Nenhuma compra lançada neste cartão para esta fatura.</p> : (
              <ul className="divide-y divide-line">
                {bill.items.map((i, n) => (
                  <li key={n} className="flex items-center gap-3 py-1.5">
                    <span className="w-24 shrink-0 tabular-nums text-muted">{fmtDate(i.day)}</span>
                    <span className="min-w-0 flex-1 truncate">{i.description || "Compra"}<span className="text-xs text-muted"> · {SOURCE_LABEL[i.source] ?? i.source}</span></span>
                    <span className="tabular-nums">{fmtBRL(i.amountCents)}</span>
                    {i.ref?.kind === "sale"
                      ? <a className="btn-subtle h-8 px-2 text-xs" href={`/app/sales?edit=${encodeURIComponent(i.ref.id)}&periodo=tudo`}>Abrir venda</a>
                      : i.ref ? <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => onItem(bill, i)} aria-label={`Editar compra ${i.description ?? ""}`}><Pencil className="h-4 w-4" /></button> : null}
                  </li>
                ))}
              </ul>
            )}
            <button type="button" className="btn-ghost mt-2 h-8 text-xs" onClick={() => onAdd(bill)}><Plus className="h-4 w-4" />Adicionar compra</button>
          </section>
        </div>
      )}
    </Modal>
  );
}

/** Adicionar uma compra no cartão (despesa do Financeiro). Aberta numa fatura, a data fica dentro dela; aberta no cartão,
 *  a data da compra decide a fatura. Se a fatura tem valor real informado, a compra soma a ele. */
function AddBillItemDialog({ card, bill: fixed, accounts, onClose }: { card: CardBills; bill: Bill | null; accounts: AccOpt[]; onClose: () => void }) {
  const router = useRouter();
  const days = fixed ? billDays(fixed.dueDate, card) : [];
  const first = days[0] ?? fixed?.dueDate ?? "";
  const last = days[days.length - 1] ?? fixed?.dueDate ?? "";
  const t0 = today();
  const [f, setF] = useState({ amount: "", day: fixed ? (t0 < first ? first : t0 > last ? last : t0) : t0, description: "", category: "", accountId: suggestedAccount(fixed, accounts), addToReal: true });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const amountCents = parseBRLToCents(f.amount) ?? 0;
  const goesTo = /^\d{4}-\d{2}-\d{2}$/.test(f.day) ? cardDueDay(f.day, card) : null;
  // sem fatura escolhida, a data da compra decide a fatura (pode ser uma que ainda não existe)
  const bill = fixed ?? (goesTo ? card.open.concat(card.paid).find((b) => b.dueDate === goesTo) ?? null : null);
  const dueDate = fixed?.dueDate ?? goesTo;
  const real = bill?.realCents ?? null;
  // total da fatura depois: com valor real, só muda se a compra somar a ele
  const after = real != null ? real + (f.addToReal ? amountCents : 0) : (bill?.itemsCents ?? 0) + amountCents;
  const paid = bill?.paidCents ?? 0;
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (amountCents <= 0) return setErro("Informe o valor");
    if (!goesTo || !dueDate) return setErro("Informe a data da compra");
    if (fixed && goesTo !== fixed.dueDate) return setErro(`Com essa data a compra vai para outra fatura: use um dia entre ${fmtDate(first)} e ${fmtDate(last)}`);
    setBusy(true);
    const r = await api("/api/finance/card-bills/items", "POST", {
      cardId: card.id, dueDate, amountCents, day: f.day, description: f.description || null, category: f.category || null, accountId: f.accountId, addToReal: real != null && f.addToReal,
    });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(`Compra adicionada: a fatura de ${fmtDate(bill?.effectiveDue ?? dueDate)} foi para ${fmtBRL(after)}`);
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={fixed ? "Adicionar compra na fatura" : `Nova compra · ${cardLabel(card)}`}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="bill-add-form" className="btn-primary" disabled={busy || !accounts.length}>Adicionar</button></>}>
      <form id="bill-add-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        {!accounts.length && <Alert kind="info">Cadastre antes uma conta em Contas: é dela que sai o pagamento da fatura.</Alert>}
        {fixed ? (
          <p className="text-sm text-muted">Fatura {cardLabel(card)} que vence {fmtDate(fixed.effectiveDue)} · hoje {fmtBRL(fixed.totalCents)}</p>
        ) : goesTo ? (
          <p className="text-sm text-muted">Vai para a fatura que vence {fmtDate(bill?.effectiveDue ?? goesTo)} · {bill ? `hoje ${fmtBRL(bill.totalCents)}` : "ainda sem compras"}</p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" required><input className="input tabular-nums" inputMode="decimal" value={f.amount} onChange={(e) => set({ amount: e.target.value })} placeholder="0,00" aria-label="Valor da compra" autoFocus /></Field>
          <Field label="Data da compra" required hint={fixed ? (goesTo && goesTo !== fixed.dueDate ? `Essa data vai para a fatura que vence em ${fmtDate(goesTo)}` : `Compras de ${fmtDate(first)} a ${fmtDate(last)} caem nesta fatura`) : `Antes do dia ${card.closingDay}, fatura do mês; no dia ${card.closingDay} ou depois, a seguinte`}>
            <input className="input" type="date" value={f.day} min={fixed ? first : undefined} max={fixed ? last : undefined} onChange={(e) => set({ day: e.target.value })} required aria-label="Data da compra" />
          </Field>
          <Field label="Descrição" className="sm:col-span-2"><input className="input" value={f.description} onChange={(e) => set({ description: e.target.value })} maxLength={200} placeholder="Ex.: Taxa de embarque, assinatura, mercado" aria-label="Descrição da compra" /></Field>
          <Field label="Categoria">
            <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria da compra">
              <option value="">Sem categoria</option>
              {categoryOptions("EXPENSE").map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Conta que paga a fatura" required>
            <select className="input" value={f.accountId} onChange={(e) => set({ accountId: e.target.value })} aria-label="Conta que paga a fatura">{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          </Field>
        </div>
        {real != null && (
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={f.addToReal} onChange={(e) => set({ addToReal: e.target.checked })} />
            <span>Somar ao valor real da fatura ({fmtBRL(real)} → {fmtBRL(real + amountCents)})<span className="block text-xs text-muted">Desmarque se esta compra já está dentro do valor real que veio no banco (aí ela só detalha a fatura).</span></span>
          </label>
        )}
        <p className="text-sm">Fatura depois: <span className="font-semibold tabular-nums">{fmtBRL(after)}</span>{paid > 0 && after > paid ? <span className="text-muted"> · falta pagar {fmtBRL(after - paid)}</span> : null}</p>
      </form>
    </Modal>
  );
}

/** Registrar ou corrigir um pagamento da fatura (inteiro ou parte). */
function PaymentDialog({ card, bill, payment, accounts, onClose }: { card: CardBills; bill: Bill; payment: BillPay | null; accounts: AccOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ date: payment?.paidAt ?? today(), amount: money(payment?.amountCents ?? (bill.openCents || bill.totalCents)), accountId: payment ? payment.accountId ?? "" : suggestedAccount(bill, accounts) });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseBRLToCents(f.amount);
    if (!amountCents || amountCents <= 0) return setErro("Informe o valor pago");
    setBusy(true);
    const body = { paidAt: f.date, amountCents, accountId: f.accountId || null };
    const r = payment ? await api(`/api/finance/card-bills/payments/${payment.id}`, "PUT", body) : await api("/api/finance/card-bills/payments", "POST", { cardId: card.id, dueDate: bill.dueDate, ...body });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(payment ? "Pagamento corrigido" : amountCents < bill.openCents ? "Pagamento parcial registrado" : "Pagamento registrado");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={payment ? "Corrigir pagamento" : "Registrar pagamento"}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="bill-pay-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="bill-pay-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Fatura {cardLabel(card)} que vence {fmtDate(bill.effectiveDue)} · total {fmtBRL(bill.totalCents)}{bill.paidCents > 0 ? ` · já pago ${fmtBRL(bill.paidCents)}` : ""}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Data do pagamento" required><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required aria-label="Data do pagamento" /></Field>
          <Field label="Valor pago (R$)" required hint="Menos que o total = pagamento parcial; o resto continua em aberto"><input className="input tabular-nums" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Valor pago" /></Field>
          <Field label="Conta de onde saiu" className="sm:col-span-2" hint="O pagamento sai do saldo desta conta do Financeiro">
            <select className="input" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} aria-label="Conta do pagamento">
              <option value="">Nenhuma</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/** Corrigir uma compra da fatura: valor, data e cartão (ou tirar do cartão). */
function BillItemDialog({ card, item, cards, onClose }: { card: CardBills; item: BillItem; cards: CardBills[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ amount: money(item.amountCents), day: item.day, cardId: card.id });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const installment = /\(\d+\/\d+\)$/.test(item.description ?? "");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amountCents = parseBRLToCents(f.amount);
    if (!installment && (!amountCents || amountCents <= 0)) return setErro("Informe o valor");
    setBusy(true);
    const r = await api("/api/finance/card-bills/items", "PATCH", {
      kind: item.ref!.kind, id: item.ref!.id, cardId: card.id, newCardId: f.cardId || null,
      ...(installment ? {} : { amountCents }), ...(f.day !== item.day ? { day: f.day } : {}),
    });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(f.cardId === card.id ? "Compra atualizada" : f.cardId ? "Compra passada para outro cartão" : "Compra tirada do cartão");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title="Corrigir compra da fatura"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="bill-item-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="bill-item-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">{item.description || "Compra"} · {SOURCE_LABEL[item.source] ?? item.source}{item.ref?.kind === "entry" ? " (muda o lançamento do Extrato)" : " (muda a despesa do Financeiro)"}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" required={!installment} hint={installment ? "Compra parcelada: o valor se muda no Extrato" : undefined}><input className="input tabular-nums" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} disabled={installment} aria-label="Valor da compra" /></Field>
          <Field label="Data da compra" required><input className="input" type="date" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} required aria-label="Data da compra" /></Field>
          <Field label="Cartão" className="sm:col-span-2" hint="Outro cartão leva a compra para a fatura dele; nenhum tira do cartão">
            <select className="input" value={f.cardId} onChange={(e) => setF({ ...f, cardId: e.target.value })} aria-label="Cartão da compra">
              {cards.map((c) => <option key={c.id} value={c.id}>{cardLabel(c)}</option>)}
              <option value="">Nenhum (tirar do cartão)</option>
            </select>
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ---------------- Contas ---------------- */

export function AccountsClient({ accounts }: { accounts: Account[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  async function remove(a: Account) {
    if (!(await confirmDialog({ title: `Excluir a conta "${a.name}"?`, body: "Se ela já tiver lançamentos, fica arquivada e o histórico continua.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api<{ result: string }>(`/api/finance/accounts/${a.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast(r.data.result === "archived" ? "Conta arquivada (tinha lançamentos)" : "Conta excluída");
    refreshSafe(router);
  }
  const active = accounts.filter((a) => !a.archived);
  return (
    <>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex-1 font-semibold">Suas contas <span className="text-muted">({active.length})</span></h2>
        <button className="btn-primary" onClick={() => setEditing("new")}><Plus className="h-4 w-4" />Nova conta</button>
      </div>
      {accounts.length === 0 ? (
        <Empty title="Nenhuma conta cadastrada" icon={<Landmark className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Cadastre suas contas (banco, caixa, carteira digital) com o saldo de hoje para acompanhar receitas, despesas e o saldo de cada uma.</p>
          <button className="btn-primary" onClick={() => setEditing("new")}>Criar primeira conta</button>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {accounts.map((a) => (
            <li key={a.id} className={`card card-pad ${a.archived ? "opacity-50" : ""}`}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color }} aria-hidden />
                <p className="flex-1 truncate font-semibold">{a.name}</p>
                {!a.archived && <button className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(a)} aria-label={`Editar ${a.name}`}><Pencil className="h-4 w-4" /></button>}
                {!a.archived && <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a)} aria-label={`Excluir ${a.name}`}><Trash2 className="h-4 w-4" /></button>}
              </div>
              <p className="text-xs text-muted">{KIND_LABEL[a.kind] ?? a.kind}{a.archived ? " · arquivada" : ""}</p>
              <p className={`mt-3 text-2xl font-semibold tabular-nums ${a.balanceCents < 0 ? "text-red-400" : ""}`}>{fmtBRL(a.balanceCents)}</p>
              <p className="text-xs text-muted">saldo inicial {fmtBRL(a.initialCents)}{a.salesCents ? ` · vendas recebidas ${fmtBRL(a.salesCents)}` : ""}</p>
            </li>
          ))}
        </ul>
      )}
      {accounts.length > 0 && <p className="mt-3 text-xs text-muted">O saldo é o saldo inicial mais o que foi recebido e menos o que foi pago: lançamentos pagos do Financeiro, vendas recebidas na conta (em Vendas, Cliente pagou) e pagamentos de faturas feitos por ela.</p>}
      {editing && <AccountDialog account={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function AccountDialog({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ name: account?.name ?? "", kind: account?.kind ?? "BANK", initial: account ? money(account.initialCents) : "", color: account?.color ?? COLORS[0]! });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const initialCents = f.initial.trim() ? parseBRLToCents(f.initial.replace(/^-/, "")) : 0;
    if (initialCents == null) return setErro("Saldo inicial inválido");
    setBusy(true);
    const body = { name: f.name, kind: f.kind, initialCents: f.initial.trim().startsWith("-") ? -initialCents : initialCents, color: f.color };
    const r = account ? await api(`/api/finance/accounts/${account.id}`, "PUT", body) : await api("/api/finance/accounts", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(account ? "Conta atualizada" : "Conta criada");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={account ? "Editar conta" : "Nova conta"} size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="acc-form" className="btn-primary" disabled={busy}>Salvar</button></>}>
      <form id="acc-form" onSubmit={save} className="space-y-3">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Nome" required><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} placeholder="Ex.: Nubank PJ" required aria-label="Nome da conta" autoFocus /></Field>
        <Field label="Tipo"><select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Tipo de conta">{Object.entries(KIND_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Saldo inicial (R$)" hint="O saldo de hoje; negativo com o sinal de menos"><input className="input" inputMode="decimal" value={f.initial} onChange={(e) => setF({ ...f, initial: e.target.value })} placeholder="0,00" aria-label="Saldo inicial" /></Field>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Cor">
          {COLORS.map((c) => <button key={c} type="button" onClick={() => setF({ ...f, color: c })} aria-label={`Cor ${c}`} aria-pressed={f.color === c} className={`h-6 w-6 rounded-full ring-offset-2 ring-offset-panel ${f.color === c ? "ring-2 ring-white" : ""}`} style={{ backgroundColor: c }} />)}
        </div>
      </form>
    </Modal>
  );
}
