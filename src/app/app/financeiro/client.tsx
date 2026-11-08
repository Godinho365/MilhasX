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

type Account = { id: string; name: string; kind: string; color: string; archived: boolean; initialCents: number; balanceCents: number };
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

type BillItem = { description: string | null; amountCents: number; source: string; day: string };
type Bill = { cardId: string; dueDate: string; totalCents: number; paidAt: string | null; overdue: boolean; paidCents: number | null; items: BillItem[] };
type CardBills = { id: string; name: string; last4: string | null; color: string | null; closingDay: number; dueDay: number; openCents: number; overdueCents: number; open: Bill[]; paid: Bill[] };
const SOURCE_LABEL: Record<string, string> = { purchases: "Extrato", saleCosts: "Venda", manual: "Financeiro" };

export function CardBillsClient({ cards }: { cards: CardBills[] }) {
  const router = useRouter();
  const nav = useNav();
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  async function pay(card: CardBills, dueDates: string[], paid: boolean, date?: string) {
    setBusy(`${card.id}:${dueDates.join(",")}`);
    const r = await api("/api/finance/card-bills", "POST", { cardId: card.id, dueDates, paid, ...(paid && date ? { date } : {}) });
    setBusy("");
    if (!r.ok) return toast(r.erro, "error");
    toast(paid ? (dueDates.length > 1 ? `${dueDates.length} faturas marcadas como pagas` : "Fatura marcada como paga") : "Fatura voltou para em aberto");
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
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="card card-pad"><p className="kicker">Em aberto nos cartões</p><p className="mt-1 text-2xl font-semibold tabular-nums">{fmtBRL(totalOpen)}</p><p className="text-xs text-muted">tudo que ainda falta pagar, somando as faturas futuras</p></div>
        <div className="card card-pad"><p className="kicker">Vencido</p><p className={`mt-1 text-2xl font-semibold tabular-nums ${totalOverdue > 0 ? "text-red-300" : ""}`}>{fmtBRL(totalOverdue)}</p><p className="text-xs text-muted">faturas que já venceram e não foram marcadas como pagas</p></div>
      </div>
      {cards.map((c) => {
        const overdue = c.open.filter((b) => b.overdue);
        return (
          <section key={c.id} className="card card-pad" aria-label={`Faturas do cartão ${c.name}`}>
            <header className="mb-3 flex flex-wrap items-center gap-3">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color ?? "#94a3b8" }} aria-hidden />
              <div className="min-w-0 flex-1"><h2 className="truncate font-semibold">{cardLabel(c)}</h2><p className="text-xs text-muted">fecha dia {c.closingDay} · vence dia {c.dueDay}</p></div>
              <div className="text-right"><p className="text-xs text-muted">Em aberto</p><p className="font-semibold tabular-nums">{fmtBRL(c.openCents)}</p>{c.overdueCents > 0 && <p className="text-xs tabular-nums text-red-300">{fmtBRL(c.overdueCents)} vencido</p>}</div>
            </header>
            {c.open.length === 0 ? <p className="py-3 text-sm text-muted">Nada em aberto neste cartão.</p> : (
              <ul className="divide-y divide-line">
                {c.open.map((b) => {
                  const k = `${c.id}:${b.dueDate}`;
                  return (
                    <li key={b.dueDate} className="py-2.5">
                      <div className="flex flex-wrap items-center gap-3">
                        <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen({ ...open, [k]: !open[k] })} aria-expanded={!!open[k]} aria-label={`Compras da fatura de ${fmtDate(b.dueDate)}`}>
                          <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open[k] ? "rotate-180" : ""}`} aria-hidden />
                          <span className="tabular-nums">Vence {fmtDate(b.dueDate)}</span>
                          {b.overdue ? <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-medium text-red-300">Vencida</span> : <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300">Em aberto</span>}
                          <span className="text-xs text-muted">{b.items.length} {b.items.length === 1 ? "compra" : "compras"}</span>
                        </button>
                        <span className="font-semibold tabular-nums">{fmtBRL(b.totalCents)}</span>
                        <form className="flex items-center gap-1.5" onSubmit={(e) => { e.preventDefault(); pay(c, [b.dueDate], true, String(new FormData(e.currentTarget).get("date") || "")); }}>
                          <input className="input h-8 w-auto py-0 text-xs" type="date" name="date" defaultValue={today()} aria-label={`Data do pagamento da fatura de ${fmtDate(b.dueDate)}`} />
                          <button className="btn-primary h-8 px-3 text-xs" disabled={busy === k}><CircleCheck className="h-4 w-4" />Paguei</button>
                        </form>
                      </div>
                      {open[k] && (
                        <ul className="mt-2 space-y-1 pl-6 text-sm">
                          {b.items.map((i, n) => <li key={n} className="flex gap-3"><span className="w-20 shrink-0 tabular-nums text-muted">{fmtDate(i.day)}</span><span className="min-w-0 flex-1 truncate">{i.description || "Compra"}<span className="text-xs text-muted"> · {SOURCE_LABEL[i.source] ?? i.source}</span></span><span className="tabular-nums">{fmtBRL(i.amountCents)}</span></li>)}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {overdue.length > 1 && <button className="btn-ghost mt-2 h-8 text-xs" disabled={!!busy} onClick={() => pay(c, overdue.map((b) => b.dueDate), true)}><CircleCheck className="h-4 w-4" />Marcar as {overdue.length} vencidas como pagas hoje</button>}
            {c.paid.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-muted">Pagas recentemente</summary>
                <ul className="mt-2 divide-y divide-line">
                  {c.paid.map((b) => (
                    <li key={b.dueDate} className="flex flex-wrap items-center gap-3 py-2">
                      <span className="flex-1 tabular-nums">Venceu {fmtDate(b.dueDate)} · <span className="text-emerald-300">paga em {fmtDate(b.paidAt!)}</span>{b.paidCents != null && b.paidCents !== b.totalCents && <span className="block text-xs text-amber-300">Paga com {fmtBRL(b.paidCents)}; hoje a fatura soma {fmtBRL(b.totalCents)} (mudaram as compras)</span>}</span>
                      <span className="tabular-nums">{fmtBRL(b.totalCents)}</span>
                      <button className="btn-subtle h-8 w-8 px-0" disabled={!!busy} onClick={() => pay(c, [b.dueDate], false)} aria-label={`Voltar a fatura de ${fmtDate(b.dueDate)} para em aberto`} title="Voltar para em aberto"><Undo2 className="h-4 w-4" /></button>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>
        );
      })}
      <p className="text-xs text-muted">A fatura soma sozinha o que você passou em cada cartão: compras e custos do Extrato com o cartão escolhido na linha de custo, custos das vendas pagos no cartão e despesas do Financeiro marcadas como &quot;no cartão&quot;. Compra parcelada cai uma parcela em cada fatura. Comprou antes do dia do fechamento, vai para a fatura do mês; no dia do fechamento ou depois, para a seguinte. Marcar como paga tira a fatura de Contas a pagar e do Passivo e conta como realizado no Fluxo de Caixa.</p>
    </div>
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
              <p className="text-xs text-muted">saldo inicial {fmtBRL(a.initialCents)}</p>
            </li>
          ))}
        </ul>
      )}
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
