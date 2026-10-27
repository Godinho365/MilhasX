"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Trash2, ReceiptText, Pencil, Trophy, MoreHorizontal, ChevronsUpDown, ChevronRight, Wallet } from "lucide-react";
import Link from "next/link";
import { api } from "@/lib/api";
import { fmtBRL, fmtDate, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { ProgramLogo } from "@/components/program-logo";
import { toast, confirmDialog } from "@/components/feedback";
import { feeCpmCents, simulateMonth } from "@/domain/cards";

type Invoice = { id: string; closingDate: string; dueDate: string; amountCents: number; expectedPoints: number; feeCents: number; pointsIncluded: boolean; status: "OPEN" | "CLOSED" | "RECEIVED" };
type Card = { id: string; name: string; brand: string | null; program: string; programId: string; logo: string | null; color: string; holder: string; accountId: string; pointsPerDollar: number; dollarRateCents: number; closingDay: number; dueDay: number; annualFeeCents: number; feeWaiverCents: number | null; balancePoints: number; balanceDate: string | null; accountCpmCents: number | null; accountBalance: number; openFeeCents: number; received: number; invoices: Invoice[] };
const money = (c: number | null | undefined) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");

const STATUS: Record<Invoice["status"], { label: string; cls: string }> = {
  OPEN: { label: "Aberta", cls: "bg-amber-500/15 text-amber-300" },
  CLOSED: { label: "Pontos a receber", cls: "bg-blue-500/15 text-blue-300" },
  RECEIVED: { label: "Pontos recebidos", cls: "bg-green-500/15 text-green-300" },
};

function nextDate(day: number, after = new Date()) {
  const d = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), Math.min(day, 28)));
  if (d < after) d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

type Stats = { activePoints: number; expectedPoints: number; openCents: number; receivedPoints: number; actionCards: number; totalCards: number };

export function CardsClient({ cards, accounts, actions, stats }: { cards: Card[]; accounts: { id: string; label: string }[]; actions: { cardId: string; card: string; invoiceId: string; dueDate: string; amountCents: number }[]; stats: Stats }) {
  const router = useRouter();
  const [cardModal, setCardModal] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Card | null>(null);
  const [registering, setRegistering] = useState<(Invoice & { card: Card }) | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [erro, setErro] = useState("");
  const newCard = () => { setErro(""); setEditing(null); setCardModal(true); };
  useEffect(() => {
    window.addEventListener("mm:new-card", newCard);
    return () => window.removeEventListener("mm:new-card", newCard);
  }, []);

  async function saveCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rate = parseBRLToCents(String(f.get("rate") || "5,50"));
    const fee = parseBRLToCents(String(f.get("fee") || "0"));
    const waiver = parseBRLToCents(String(f.get("waiver") || "0"));
    if (rate === null || fee === null || waiver === null) return setErro("Valor inválido");
    const body = {
      accountId: f.get("accountId"), name: f.get("name"), brand: f.get("brand") || null,
      pointsPerDollar: Math.round(Number(String(f.get("ppd")).replace(",", ".")) * 100), dollarRateCents: rate,
      closingDay: Number(f.get("closing")), dueDay: Number(f.get("due")), annualFeeCents: fee, feeWaiverCents: waiver || null,
    };
    const r = editing ? await api<{ item: { id: string } }>(`/api/cards/${editing.id}`, "PUT", body) : await api<{ item: { id: string } }>("/api/cards", "POST", body);
    if (!r.ok) return setErro(r.erro);
    // Pontos que o cartão já tem acumulados: viram "Saldo inicial" na conta que recebe os pontos
    const bal = Number(String(f.get("balance") || "0").replace(/\D/g, "")) || 0;
    const balDate = String(f.get("balanceDate") || new Date().toISOString().slice(0, 10));
    if (bal !== (editing?.balancePoints ?? 0) || (bal > 0 && balDate !== editing?.balanceDate)) {
      const b = await api(`/api/cards/${r.data.item.id}/balance`, "PUT", { points: bal, date: balDate });
      if (!b.ok) return setErro(b.erro);
    }
    setErro("");
    setCardModal(false);
    toast(editing ? "Cartão atualizado" : "Cartão cadastrado");
    setEditing(null);
    refreshSafe(router);
  }
  async function saveInvoice(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!invoiceFor) return;
    const f = new FormData(e.currentTarget);
    const amount = parseBRLToCents(String(f.get("amount") || ""));
    if (!amount) return setErro("Informe o valor da fatura");
    const r = await api(`/api/cards/${invoiceFor.id}/invoices`, "POST", { closingDate: f.get("closing"), dueDate: f.get("due"), amountCents: amount, pointsIncluded: f.get("included") === "on" });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setInvoiceFor(null);
    toast("Fatura adicionada");
    refreshSafe(router);
  }
  async function register(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!registering) return;
    const f = new FormData(e.currentTarget);
    const points = Number(String(f.get("points") || "0").replace(/\D/g, ""));
    const r = await api(`/api/invoices/${registering.id}/register`, "POST", { points, date: f.get("date") });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setRegistering(null);
    toast("Pontos registrados");
    refreshSafe(router);
  }
  async function markIncluded(id: string) {
    const ok = await confirmDialog({ title: "Pontos já estão no saldo do cartão?", body: "A fatura deixa de lançar pontos. Se já estiver fechada com pontos a receber, esse lançamento sai do extrato.", confirmLabel: "Marcar como incluída" });
    if (!ok) return;
    const r = await api(`/api/invoices/${id}`, "PATCH", { pointsIncluded: true });
    if (!r.ok) return toast(r.erro, "error");
    toast("Fatura marcada como incluída no saldo");
    refreshSafe(router);
  }
  async function setIncluded(id: string, included: boolean) {
    const r = await api(`/api/invoices/${id}`, "PATCH", { pointsIncluded: included });
    if (!r.ok) return toast(r.erro, "error");
    toast(included ? "Fatura marcada como incluída no saldo" : "Os pontos desta fatura serão lançados à parte");
    refreshSafe(router);
  }
  async function delInvoice(id: string) {
    if (!(await confirmDialog({ title: "Excluir fatura?", body: "Se os pontos já foram lançados, o lançamento também é excluído.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/invoices/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Fatura excluída");
    refreshSafe(router);
  }
  async function delCard(c: Card) {
    if (!(await confirmDialog({ title: `Excluir ${c.name}?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/cards/${c.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Cartão excluído");
    refreshSafe(router);
  }

  const now = Date.now();
  const all = cards.flatMap((c) => c.invoices.map((i) => ({ ...i, card: c }))).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const upcoming = all.filter((i) => i.status !== "RECEIVED" && !(i.pointsIncluded && i.status === "CLOSED"));
  const past = all.filter((i) => !upcoming.includes(i)).reverse();
  const needsAction = (c: Card) => c.invoices.some((i) => invoiceState(i, now).action === "register");
  const first = actions[0] ?? (() => { const i = upcoming.find((x) => invoiceState(x, now).action === "register"); return i ? { cardId: i.card.id, card: i.card.name, invoiceId: i.id, dueDate: i.dueDate, amountCents: i.amountCents } : null; })();
  const kpi = (label: string, value: string, hint: string, tone: string) => (
    <div className={`card card-pad bg-gradient-to-br ${tone}`} aria-label={`${label}: ${value}`}>
      <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">{label}<ChevronsUpDown className="h-3.5 w-3.5" aria-hidden /></p>
      <p className="mt-2 text-[28px] font-semibold tabular-nums tracking-tight">{value}</p>
      <p className="mt-1 text-sm text-muted">{hint}</p>
    </div>
  );
  const invoiceRow = (i: Invoice & { card: Card }) => {
    const st = invoiceState(i, now);
    return (
      <tr key={i.id}>
        <td><span className="flex items-center gap-2 font-medium"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: i.card.color }} aria-hidden />{i.card.name}</span></td>
        <td className="whitespace-nowrap"><span className="flex items-center gap-2" title={`Fecha ${fmtDate(i.closingDate)} · vence ${fmtDate(i.dueDate)}`}><span className={`h-2 w-2 rounded-full ${Date.parse(i.dueDate) < now && st.action === "register" ? "bg-red-400" : "bg-zinc-500"}`} aria-hidden />{shortDate(i.dueDate)}</span></td>
        <td><span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.cls}`}>{st.label}</span></td>
        <td className="whitespace-nowrap font-semibold tabular-nums">{fmtBRL(i.amountCents)}</td>
        <td className="tabular-nums">{i.expectedPoints > 0 ? <>{fmtPts(i.expectedPoints)}{i.pointsIncluded && <span className="block text-[11px] text-muted">já no saldo</span>}</> : "--"}</td>
        <td className="whitespace-nowrap">
          <span className="flex items-center justify-end gap-1.5">
            {st.action === "register" && <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => { setErro(""); setRegistering(i); }}><Trophy className="h-3.5 w-3.5" />Registrar pontos</button>}
            {st.action === "unmark" && <button type="button" className="btn-ghost h-8 px-3 text-xs" onClick={() => setIncluded(i.id, false)} title="Os pontos desta fatura ainda não estão no saldo do cartão">Lançar pontos à parte</button>}
            {st.action === "none" && i.status === "RECEIVED" && <Link href="/app/entries" className="btn-ghost h-8 px-3 text-xs">Ver no extrato</Link>}
            {st.action === "none" && i.status !== "RECEIVED" && <span className="px-3 text-xs text-muted">Nada a fazer</span>}
            <RowMenu label={`Ações da fatura de ${shortDate(i.dueDate)}`} items={[
              ...(st.action === "register" ? [{ label: "Pontos já estão no saldo", icon: <Wallet className="h-4 w-4" />, onClick: () => markIncluded(i.id) }] : []),
              { label: "Excluir fatura", icon: <Trash2 className="h-4 w-4" />, onClick: () => delInvoice(i.id), danger: true },
            ]} />
          </span>
        </td>
      </tr>
    );
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpi("Pontos esperados", fmtPts(stats.expectedPoints), "Próximas faturas", "from-panel to-panel")}
        {kpi("Valor em aberto", fmtBRL(stats.openCents), "Próximas faturas", "from-panel to-panel")}
        {kpi("Pontos recebidos", fmtPts(stats.receivedPoints), "De todas as faturas", "from-panel to-panel")}
        {kpi("Ação necessária", `${stats.actionCards} de ${stats.totalCards}`, stats.actionCards ? (stats.actionCards === 1 ? "cartão precisa de atenção" : "cartões precisam de atenção") : "tudo em dia", stats.actionCards ? "from-panel to-amber-500/10" : "from-panel to-panel")}
      </div>

      {first && (
        <section className="card mb-4 flex flex-wrap items-center gap-3 bg-gradient-to-r from-accent-soft/60 to-panel px-5 py-4" aria-label="Próximo passo">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Próximo passo</p>
            <p className="truncate text-sm text-muted">{first.card} · Fatura de {new Date(first.dueDate).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {fmtBRL(first.amountCents)}</p>
          </div>
          <button type="button" className="btn-ghost h-9 bg-panel" onClick={() => { const i = all.find((x) => x.id === first.invoiceId); if (i) { setErro(""); setRegistering(i); } }}><Trophy className="h-4 w-4" />Registrar pontos</button>
        </section>
      )}

      {cards.length === 0 ? (
        <Empty title="Nenhum cartão cadastrado" icon={<CreditCard className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{accounts.length === 0 ? "Cadastre primeiro uma conta em Programas para receber os pontos do cartão." : "Cadastre seus cartões para acompanhar faturas e a pontuação de cada um."}</p>
          <button className="btn-primary" onClick={newCard} disabled={accounts.length === 0}>Novo cartão</button>
        </Empty>
      ) : (
        <section className="card mb-4 overflow-visible" aria-label="Cartões">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Cartão</th><th>Pontuação</th><th className="hidden md:table-cell">Acumulado · CPM</th><th>Status</th><th className="w-12" /></tr></thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <span className="flex items-center gap-3">
                        <ProgramLogo programId={c.programId} name={c.program} color={c.color} version={c.logo} size={36} />
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2"><span className="truncate font-semibold">{c.name}</span>{c.brand && <span className="rounded border border-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{c.brand}</span>}</span>
                          <span className="block truncate text-xs text-muted">{c.program} · {c.holder}</span>
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap tabular-nums">{c.pointsPerDollar.toLocaleString("pt-BR")} pts/US$</td>
                    <td className="hidden tabular-nums md:table-cell">
                      <span className="font-medium">{c.balancePoints > 0 ? `${fmtPts(c.balancePoints)} pts` : "--"}</span>
                      <span className="block text-[11px] text-muted">CPM {c.accountCpmCents != null ? fmtBRL(c.accountCpmCents) : "R$ 0,00"}{c.annualFeeCents > 0 ? ` · anuidade ${fmtBRL(Math.round(c.annualFeeCents / 12))}/mês` : ""}</span>
                    </td>
                                        <td className="whitespace-nowrap text-sm">{needsAction(c) ? <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-400" aria-hidden />Registrar pontos</span> : <span className="flex items-center gap-1.5 text-muted"><span className="h-2 w-2 rounded-full bg-zinc-500" aria-hidden />Em dia</span>}</td>
                    <td className="text-right">
                      <RowMenu label={`Ações de ${c.name}`} items={[
                        { label: "Adicionar fatura", icon: <ReceiptText className="h-4 w-4" />, onClick: () => { setErro(""); setInvoiceFor(c); } },
                        { label: "Editar cartão", icon: <Pencil className="h-4 w-4" />, onClick: () => { setErro(""); setEditing(c); setCardModal(true); } },
                        { label: "Excluir", icon: <Trash2 className="h-4 w-4" />, onClick: () => delCard(c), danger: true },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {cards.length > 0 && (
        <section className="card overflow-hidden" aria-label="Próximas faturas">
          <h2 className="border-b border-line px-5 py-4 font-semibold">Próximas faturas</h2>
          {upcoming.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">Nenhuma fatura pendente. Use ⋯ › Adicionar fatura no cartão.</p> : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead><tr><th>Cartão</th><th>Datas</th><th>Status</th><th>Valor</th><th>Esperado</th><th className="text-right">Ação</th></tr></thead>
                <tbody>{upcoming.map(invoiceRow)}</tbody>
              </table>
            </div>
          )}
          {past.length > 0 && (
            <div className="border-t border-line">
              <button type="button" className="flex w-full items-center gap-2 px-5 py-3 text-sm text-muted hover:text-zinc-100" onClick={() => setShowPast(!showPast)} aria-expanded={showPast}><ChevronRight className={`h-4 w-4 transition-transform ${showPast ? "rotate-90" : ""}`} />Faturas anteriores ({past.length})</button>
              {showPast && <div className="overflow-x-auto"><table className="table-base"><tbody>{past.map(invoiceRow)}</tbody></table></div>}
            </div>
          )}
        </section>
      )}

      <Modal open={cardModal} onClose={() => { setCardModal(false); setEditing(null); }} title={editing ? `Editar ${editing.name}` : "Novo cartão"} footer={<><button className="btn-ghost" onClick={() => { setCardModal(false); setEditing(null); }}>Cancelar</button><button form="card-form" className="btn-primary">Salvar</button></>}>
        <CardForm key={editing?.id ?? "novo"} card={editing} accounts={accounts} erro={erro} onSubmit={saveCard} />
      </Modal>
      <Modal open={!!invoiceFor} onClose={() => setInvoiceFor(null)} title={`Nova fatura · ${invoiceFor?.name ?? ""}`} size="sm" footer={<><button className="btn-ghost" onClick={() => setInvoiceFor(null)}>Cancelar</button><button form="invoice-form" className="btn-primary">Adicionar</button></>}>
        {invoiceFor && (
          <form id="invoice-form" onSubmit={saveInvoice} className="space-y-4">
            {erro && <Alert>{erro}</Alert>}
            <Field label="Valor da fatura (R$)" required><input className="input" name="amount" inputMode="decimal" required placeholder="0,00" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fechamento" required><input className="input" type="date" name="closing" required defaultValue={nextDate(invoiceFor.closingDay)} /></Field>
              <Field label="Vencimento" required><input className="input" type="date" name="due" required defaultValue={nextDate(invoiceFor.dueDay, new Date(nextDate(invoiceFor.closingDay)))} /></Field>
            </div>
            <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="included" className="checkbox mt-0.5" defaultChecked={invoiceFor.balancePoints > 0} />Os pontos desta fatura já estão no saldo acumulado do cartão (não lançar de novo)</label>
            <p className="text-xs text-muted">Pontos estimados: valor ÷ cotação (R$ {(invoiceFor.dollarRateCents / 100).toFixed(2).replace(".", ",")}) × {invoiceFor.pointsPerDollar.toLocaleString("pt-BR")} pts/US$.</p>
          </form>
        )}
      </Modal>
      <Modal open={!!registering} onClose={() => setRegistering(null)} title="Registrar pontos" size="sm" footer={<><button className="btn-ghost" onClick={() => setRegistering(null)}>Cancelar</button><button form="register-form" className="btn-primary">Registrar</button></>}>
        {registering && (
          <form id="register-form" onSubmit={register} className="space-y-4">
            {erro && <Alert>{erro}</Alert>}
            <p className="text-sm text-muted">{registering.card.name} · fatura de {fmtDate(registering.dueDate)} · {fmtBRL(registering.amountCents)}. Informe quantos pontos caíram na conta {registering.card.program} · {registering.card.holder}.</p>
            <Field label="Pontos recebidos" required hint={registering.expectedPoints > 0 ? `Estimado: ${fmtPts(registering.expectedPoints)} pts` : undefined}><input className="input tabular-nums" name="points" inputMode="numeric" required defaultValue={registering.expectedPoints > 0 ? fmtPts(registering.expectedPoints) : ""} placeholder="0" /></Field>
            <Field label="Data do crédito" required><input className="input" type="date" name="date" required defaultValue={new Date().toISOString().slice(0, 10)} /></Field>
            {registering.feeCents > 0 && <p className="text-xs text-muted">A parcela da anuidade desta fatura ({fmtBRL(registering.feeCents)}) entra como custo destes pontos.</p>}
          </form>
        )}
      </Modal>
    </>
  );
}

/** Situação da fatura como na referência: aberta, fechada, paga (vencida sem pontos), a receber ou recebida. */
function invoiceState(i: Invoice, now: number): { label: string; cls: string; action: "register" | "unmark" | "none" } {
  if (i.status === "RECEIVED") return { label: "Pontos recebidos", cls: "bg-green-500/15 text-green-300", action: "none" };
  if (i.pointsIncluded) return { label: "No saldo do cartão", cls: "bg-panel2 text-muted", action: i.status === "OPEN" ? "unmark" : "none" };
  if (i.status === "CLOSED") return { label: "A receber", cls: "bg-blue-500/15 text-blue-300", action: "register" };
  if (Date.parse(i.dueDate) < now) return { label: "Paga", cls: "bg-green-500/15 text-green-300", action: "register" };
  if (Date.parse(i.closingDate) < now) return { label: "Fechada", cls: "bg-amber-500/15 text-amber-300", action: "register" };
  return { label: "Aberta", cls: "bg-panel2 text-zinc-300", action: "register" };
}
const shortDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "UTC" });


/** Formulário do cartão (novo ou edição) com simulação: gastando X no mês, quantos pontos e qual CPM da anuidade. */
function CardForm({ card, accounts, erro, onSubmit }: { card: Card | null; accounts: { id: string; label: string }[]; erro: string; onSubmit: (e: React.FormEvent<HTMLFormElement>) => void }) {
  const [ppd, setPpd] = useState(card ? String(card.pointsPerDollar).replace(".", ",") : "");
  const [rate, setRate] = useState(card ? money(card.dollarRateCents) : "5,50");
  const [fee, setFee] = useState(card ? money(card.annualFeeCents) : "");
  const [waiver, setWaiver] = useState(card ? money(card.feeWaiverCents) : "");
  const [spend, setSpend] = useState(card?.invoices[0] ? money(card.invoices[0].amountCents) : "5.000,00");
  const rule = {
    pointsPerDollar: Math.round((Number(ppd.replace(",", ".")) || 0) * 100),
    dollarRateCents: parseBRLToCents(rate) ?? 0,
    annualFeeCents: parseBRLToCents(fee) ?? 0,
    feeWaiverCents: parseBRLToCents(waiver) || null,
  };
  const s = simulateMonth(rule, parseBRLToCents(spend) ?? 0);
  return (
    <form id="card-form" onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
      {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
      <Field label="Nome do cartão" required className="sm:col-span-2"><input className="input" name="name" required maxLength={80} placeholder="Ex.: Visa Infinite do banco X" defaultValue={card?.name} /></Field>
      <Field label="Conta que recebe os pontos" required><select className="input" name="accountId" required defaultValue={card?.accountId ?? ""}><option value="" disabled>Selecione</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
      <Field label="Bandeira"><input className="input" name="brand" maxLength={30} placeholder="Visa, Mastercard…" defaultValue={card?.brand ?? ""} /></Field>
      <Field label="Pontos por dólar" required><input className="input" name="ppd" inputMode="decimal" required placeholder="2,2" value={ppd} onChange={(e) => setPpd(e.target.value)} /></Field>
      <Field label="Cotação do dólar (R$)" hint="Usada para estimar os pontos"><input className="input" name="rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></Field>
      <Field label="Dia do fechamento" required><input className="input" name="closing" type="number" min={1} max={31} required defaultValue={card?.closingDay} /></Field>
      <Field label="Dia do vencimento" required><input className="input" name="due" type="number" min={1} max={31} required defaultValue={card?.dueDay} /></Field>
      <Field label="Pontos já acumulados no cartão" hint="Entram no saldo da conta que recebe os pontos (lançamento “Saldo inicial”)"><input className="input" name="balance" inputMode="numeric" placeholder="0" defaultValue={card?.balancePoints ? fmtPts(card.balancePoints) : ""} /></Field>
      <Field label="Data do saldo"><input className="input" type="date" name="balanceDate" defaultValue={card?.balanceDate ?? new Date().toISOString().slice(0, 10)} /></Field>
      <Field label="Anuidade (R$ por ano)" hint="Cobrada em 12 parcelas; cada parcela vira custo dos pontos da fatura"><input className="input" name="fee" inputMode="decimal" placeholder="0,00" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      <Field label="Isenta gastando (R$ por mês)" hint="Vazio: sem isenção. Ex.: 8.000,00"><input className="input" name="waiver" inputMode="decimal" placeholder="8.000,00" value={waiver} onChange={(e) => setWaiver(e.target.value)} /></Field>
      <section className="rounded-xl border border-line bg-panel2 p-4 sm:col-span-2" aria-label="Simulação do mês">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Se eu gastar no mês (R$)" className="w-44"><input className="input" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} aria-label="Gasto no mês" /></Field>
          <dl className="grid flex-1 grid-cols-3 gap-2 text-sm">
            <div><dt className="kicker">Pontos</dt><dd className="font-semibold tabular-nums">{fmtPts(s.points)}</dd></div>
            <div><dt className="kicker">Anuidade no mês</dt><dd className="font-semibold tabular-nums">{rule.annualFeeCents <= 0 ? "—" : s.waived ? "Isenta" : fmtBRL(s.feeCents)}</dd></div>
            <div><dt className="kicker">CPM da anuidade</dt><dd className="font-semibold tabular-nums" aria-label="CPM da anuidade">{s.cpmCents > 0 ? fmtBRL(s.cpmCents) : "R$ 0,00"}</dd></div>
          </dl>
        </div>
        {rule.annualFeeCents > 0 && rule.feeWaiverCents && !s.waived && <p className="mt-2 text-xs text-muted">Faltam {fmtBRL(rule.feeWaiverCents - (parseBRLToCents(spend) ?? 0))} no mês para isentar a anuidade.</p>}
      </section>
    </form>
  );
}

type MenuItem = { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean };

/** Menu ⋯ da linha: abre flutuando sobre a página (fixed), então a rolagem da tabela não corta. */
function RowMenu({ label, items }: { label: string; items: MenuItem[] }) {
  const btn = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const place = () => {
    const r = btn.current!.getBoundingClientRect();
    const h = items.length * 40 + 10;
    setPos({ top: r.bottom + 4 + h > window.innerHeight ? r.top - h - 4 : r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  };
  const open = !!pos;
  useEffect(() => {
    if (!open) return;
    // fecha ao clicar fora; ao rolar, acompanha o botão
    const close = () => setPos(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (pos) return setPos(null);
    place();
  }
  return (
    <>
      <button ref={btn} type="button" className="btn-subtle h-8 w-8 px-0" onClick={toggle} aria-label={label} aria-haspopup="menu" aria-expanded={!!pos}><MoreHorizontal className="h-4 w-4" /></button>
      {pos && (
        <div role="menu" className="fixed z-50 w-56 rounded-xl border border-line bg-panel p-1 text-left shadow-xl" style={{ top: pos.top, right: pos.right }}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" type="button" className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-panel2 ${it.danger ? "text-red-300" : ""}`} onClick={() => { setPos(null); it.onClick(); }}>{it.icon}{it.label}</button>
          ))}
        </div>
      )}
    </>
  );
}
