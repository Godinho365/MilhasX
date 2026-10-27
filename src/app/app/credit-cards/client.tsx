"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useState } from "react";
import { CreditCard, Plus, Trash2, FileCheck2, CircleAlert, ReceiptText, Pencil } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDate, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { ProgramDot } from "@/components/stat";
import { toast, confirmDialog } from "@/components/feedback";
import { feeCpmCents, simulateMonth } from "@/domain/cards";

type Invoice = { id: string; closingDate: string; dueDate: string; amountCents: number; expectedPoints: number; feeCents: number; status: "OPEN" | "CLOSED" | "RECEIVED" };
type Card = { id: string; name: string; brand: string | null; program: string; color: string; holder: string; accountId: string; pointsPerDollar: number; dollarRateCents: number; closingDay: number; dueDay: number; annualFeeCents: number; feeWaiverCents: number | null; received: number; invoices: Invoice[] };
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

type Stats = { expectedPoints: number; openCents: number; receivedPoints: number; actionCards: number; totalCards: number };
type Tab = "resumo" | "faturas" | "cartoes";
type InvoiceFilter = "all" | "OPEN" | "CLOSED" | "RECEIVED";

export function CardsClient({ cards, accounts, actions, stats }: { cards: Card[]; accounts: { id: string; label: string }[]; actions: { cardId: string; card: string; invoiceId: string; dueDate: string; amountCents: number }[]; stats: Stats }) {
  const router = useRouter();
  // A aba fica no endereço (?tab=) para sobreviver a um recarregamento depois de salvar
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (["resumo", "faturas", "cartoes"] as const).find((t) => t === params.get("tab")) ?? "resumo");
  const [invFilter, setInvFilter] = useState<InvoiceFilter>("all");
  const go = (t: Tab, filter: InvoiceFilter = "all") => {
    setTab(t);
    setInvFilter(filter);
    window.history.replaceState(null, "", t === "resumo" ? window.location.pathname : `?tab=${t}`);
  };
  const [cardModal, setCardModal] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [invoiceFor, setInvoiceFor] = useState<Card | null>(null);
  const [erro, setErro] = useState("");

  async function saveCard(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const rate = parseBRLToCents(String(f.get("rate") || "5,50"));
    const fee = parseBRLToCents(String(f.get("fee") || "0"));
    if (rate === null || fee === null) return setErro("Valor inválido");
    const waiver = parseBRLToCents(String(f.get("waiver") || "0"));
    if (waiver === null) return setErro("Valor inválido");
    const body = {
      accountId: f.get("accountId"), name: f.get("name"), brand: f.get("brand") || null,
      pointsPerDollar: Math.round(Number(String(f.get("ppd")).replace(",", ".")) * 100), dollarRateCents: rate,
      closingDay: Number(f.get("closing")), dueDay: Number(f.get("due")), annualFeeCents: fee, feeWaiverCents: waiver || null,
    };
    const r = editing ? await api(`/api/cards/${editing.id}`, "PUT", body) : await api("/api/cards", "POST", body);
    if (!r.ok) return setErro(r.erro);
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
    const r = await api(`/api/cards/${invoiceFor.id}/invoices`, "POST", { closingDate: f.get("closing"), dueDate: f.get("due"), amountCents: amount });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setInvoiceFor(null);
    toast("Fatura adicionada");
    refreshSafe(router);
  }
  async function close(invoiceId: string) {
    const ok = await confirmDialog({ title: "Fechar fatura?", body: "Os pontos esperados entram no extrato como “a receber”. Quando caírem na conta, marque como recebidos no extrato.", confirmLabel: "Fechar fatura" });
    if (!ok) return;
    const r = await api(`/api/invoices/${invoiceId}/close`, "POST");
    if (!r.ok) return toast(r.erro, "error");
    toast("Fatura fechada");
    refreshSafe(router);
  }
  async function delInvoice(id: string) {
    if (!(await confirmDialog({ title: "Excluir fatura?", body: "Se ela já foi fechada, o lançamento de pontos também é excluído.", confirmLabel: "Excluir", danger: true }))) return;
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

  const invoices = cards.flatMap((c) => c.invoices.map((i) => ({ ...i, card: c }))).sort((a, b) => b.dueDate.localeCompare(a.dueDate)).filter((i) => invFilter === "all" || i.status === invFilter);
  const kpi = (label: string, value: string, hint: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="card card-pad text-left transition-colors hover:border-zinc-500" aria-label={`${label}: ${value}`}>
      <p className="kicker">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight sm:text-[28px]">{value}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
    </button>
  );

  return (
    <>
      <div className="mb-5 flex justify-center">
        <nav className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Cartões">
          {([["resumo", "Resumo"], ["faturas", "Faturas"], ["cartoes", "Cartões"]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)} className={`rounded-lg px-3.5 py-1.5 text-sm font-medium ${tab === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </nav>
      </div>

      {tab === "resumo" && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4">
            {kpi("Pontos esperados", fmtPts(stats.expectedPoints), "Próximas faturas", () => go("faturas", "OPEN"))}
            {kpi("Valor em aberto", fmtBRL(stats.openCents), "Próximas faturas", () => go("faturas", "OPEN"))}
            {kpi("Pontos recebidos", fmtPts(stats.receivedPoints), "De todas as faturas", () => go("faturas", "RECEIVED"))}
            {kpi("Ação necessária", `${stats.actionCards} de ${stats.totalCards}`, stats.actionCards ? "cartão precisa de atenção" : "tudo em dia", () => go(stats.actionCards ? "resumo" : "cartoes"))}
          </div>
          {actions.length > 0 ? (
            <section className="card overflow-hidden" aria-label="Próximo passo">
              <h2 className="flex items-center gap-2 border-b border-line px-5 py-4 font-semibold"><CircleAlert className="h-5 w-5 text-amber-300" />Próximo passo</h2>
              <ul className="divide-y divide-line">
                {actions.map((a) => (
                  <li key={a.invoiceId} className="flex flex-wrap items-center gap-3 px-5 py-3">
                    <p className="min-w-0 flex-1 truncate text-sm">{a.card} · Fatura de {new Date(a.dueDate).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {fmtBRL(a.amountCents)}</p>
                    <button className="btn-ghost h-8" onClick={() => close(a.invoiceId)}><FileCheck2 className="h-4 w-4" />Fechar fatura</button>
                  </li>
                ))}
              </ul>
            </section>
          ) : cards.length === 0 ? (
            <Empty title="Nenhum cartão cadastrado" icon={<CreditCard className="h-5 w-5" />}>
              <p className="max-w-sm text-sm text-muted">{accounts.length === 0 ? "Cadastre primeiro uma conta em Programas para receber os pontos do cartão." : "Cadastre seus cartões para acompanhar faturas e a pontuação de cada um."}</p>
              <button className="btn-primary" onClick={() => { setErro(""); setEditing(null); setCardModal(true); }} disabled={accounts.length === 0}>Novo cartão</button>
            </Empty>
          ) : (
            <p className="card card-pad text-center text-sm text-muted">Tudo em dia: nenhuma fatura precisa de ação agora.</p>
          )}
        </>
      )}

      {tab === "faturas" && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
            <h2 className="mr-auto text-lg font-semibold">Faturas</h2>
            <select className="input h-9 w-44" value={invFilter} onChange={(e) => setInvFilter(e.target.value as InvoiceFilter)} aria-label="Situação da fatura">
              <option value="all">Todas</option>
              <option value="OPEN">Em aberto</option>
              <option value="CLOSED">Fechadas (a receber)</option>
              <option value="RECEIVED">Recebidas</option>
            </select>
          </div>
          {invoices.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">{cards.length ? "Nenhuma fatura nessa situação. Adicione faturas na aba Cartões." : "Cadastre um cartão na aba Cartões."}</p> : (
            <ul className="divide-y divide-line">
              {invoices.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.card.name}</p>
                    <p className="text-xs text-muted">Fecha {fmtDate(i.closingDate)} · vence {fmtDate(i.dueDate)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>
                  <span className="w-24 text-right font-medium tabular-nums">{fmtBRL(i.amountCents)}</span>
                  <span className="w-28 text-right text-sm tabular-nums text-muted">{fmtPts(i.expectedPoints)} pts</span>
                  <span className="w-36 text-right text-xs tabular-nums text-muted" title="Parcela da anuidade nesta fatura e o custo por milheiro que ela gera">{i.feeCents > 0 ? <>Anuidade {fmtBRL(i.feeCents)}<br />CPM {fmtBRL(feeCpmCents(i.feeCents, i.expectedPoints))}</> : i.card.annualFeeCents > 0 ? "Anuidade isenta" : "Sem anuidade"}</span>
                  <span className="flex gap-1">
                    {i.status === "OPEN" && <button className="btn-ghost h-8" onClick={() => close(i.id)}>Fechar fatura</button>}
                    <button className="btn-subtle h-8 w-8 px-0" onClick={() => delInvoice(i.id)} aria-label="Excluir fatura"><Trash2 className="h-4 w-4" /></button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === "cartoes" && (
        <>
          <div className="mb-3 flex justify-end"><button className="btn-primary" onClick={() => { setErro(""); setEditing(null); setCardModal(true); }} disabled={accounts.length === 0}><Plus className="h-4 w-4" />Novo cartão</button></div>
          {cards.length === 0 ? (
            <Empty title="Nenhum cartão cadastrado" icon={<CreditCard className="h-5 w-5" />}>
              <p className="max-w-sm text-sm text-muted">{accounts.length === 0 ? "Cadastre primeiro uma conta em Programas para receber os pontos do cartão." : "Cadastre seus cartões para acompanhar faturas e a pontuação de cada um."}</p>
            </Empty>
          ) : (
            <div className="card overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table-base">
                  <thead><tr><th>Cartão</th><th className="text-right">Pontuação</th><th className="hidden text-right sm:table-cell">Fechamento / venc.</th><th className="hidden text-right lg:table-cell">Anuidade / CPM</th><th className="hidden text-right md:table-cell">Recebido</th><th className="w-28 text-right">Ações</th></tr></thead>
                  <tbody>
                    {cards.map((c) => (
                      <tr key={c.id}>
                        <td>
                          <span className="flex items-center gap-3">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.color}26`, color: c.color }}><CreditCard className="h-4 w-4" /></span>
                            <span className="min-w-0">
                              <span className="block truncate font-semibold">{c.name}</span>
                              <span className="flex items-center gap-1.5 truncate text-xs text-muted"><ProgramDot color={c.color} />{c.program} · {c.holder}{c.brand && ` · ${c.brand}`}</span>
                            </span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap text-right tabular-nums">{c.pointsPerDollar.toLocaleString("pt-BR")} pts/US$</td>
                        <td className="hidden text-right tabular-nums text-muted sm:table-cell">dia {c.closingDay} / dia {c.dueDay}</td>
                        <td className="hidden text-right text-xs tabular-nums lg:table-cell"><FeeSummary c={c} /></td>
                        <td className="hidden text-right tabular-nums md:table-cell">{c.received ? fmtPts(c.received) : "-"}</td>
                        <td className="whitespace-nowrap text-right">
                          <button className="btn-subtle h-8 w-8 px-0" onClick={() => { setErro(""); setInvoiceFor(c); }} aria-label={`Adicionar fatura de ${c.name}`} title="Adicionar fatura"><ReceiptText className="h-4 w-4" /></button>
                          <button className="btn-subtle h-8 w-8 px-0" onClick={() => { setErro(""); setEditing(c); setCardModal(true); }} aria-label={`Editar ${c.name}`} title="Editar"><Pencil className="h-4 w-4" /></button>
                          <button className="btn-subtle h-8 w-8 px-0" onClick={() => delCard(c)} aria-label={`Excluir ${c.name}`}><Trash2 className="h-4 w-4" /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
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
            <p className="text-xs text-muted">Pontos estimados: valor ÷ cotação (R$ {(invoiceFor.dollarRateCents / 100).toFixed(2).replace(".", ",")}) × {invoiceFor.pointsPerDollar.toLocaleString("pt-BR")} pts/US$.</p>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Resumo da anuidade do cartão: valor, isenção e o CPM que ela gera na fatura mais recente. */
function FeeSummary({ c }: { c: Card }) {
  if (c.annualFeeCents <= 0) return <span className="text-muted">Sem anuidade</span>;
  const last = c.invoices[0];
  const sim = last ? null : c.feeWaiverCents ? simulateMonth({ ...c, pointsPerDollar: Math.round(c.pointsPerDollar * 100) }, c.feeWaiverCents - 1) : null;
  return (
    <span className="block">
      <span className="block">{fmtBRL(c.annualFeeCents)}/ano · {fmtBRL(Math.round(c.annualFeeCents / 12))}/mês</span>
      {c.feeWaiverCents ? <span className="block text-muted">Isenta gastando {fmtBRL(c.feeWaiverCents)}/mês</span> : <span className="block text-muted">Sem isenção</span>}
      {last ? (
        <span className="block font-medium">{last.feeCents > 0 ? `CPM ${fmtBRL(feeCpmCents(last.feeCents, last.expectedPoints))} na última fatura` : "Última fatura isenta"}</span>
      ) : sim && sim.cpmCents > 0 ? (
        <span className="block font-medium">CPM até {fmtBRL(sim.cpmCents)} sem isentar</span>
      ) : null}
    </span>
  );
}

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
