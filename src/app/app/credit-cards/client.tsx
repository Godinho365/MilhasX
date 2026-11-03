"use client";
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { CreditCard, Trash2, ReceiptText, Pencil, Trophy, MoreHorizontal, ChevronsUpDown, ChevronRight, Wallet, Plus, Search, LayoutGrid, List, Bell } from "lucide-react";
import Link from "next/link";
import { api, today } from "@/lib/api";
import { fmtBRL, fmtDate, fmtPts, parseBRLToCents, shortName } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { ProgramLogo } from "@/components/program-logo";
import { toast, confirmDialog } from "@/components/feedback";
import { BRANDS, CARD_STATUS, ALL_BENEFITS, MODALITIES } from "@/domain/card-catalog";
import { CardDialog, CardFace } from "./card-dialog";

type Invoice = { id: string; closingDate: string; dueDate: string; amountCents: number; expectedPoints: number; feeCents: number; pointsIncluded: boolean; status: "OPEN" | "CLOSED" | "RECEIVED" };
export type CardView = {
  id: string; name: string; brand: string | null; program: string; programId: string; logo: string | null; color: string; holder: string; accountId: string;
  pointsPerDollar: number; dollarRateCents: number; closingDay: number; dueDay: number; annualFeeCents: number; feeWaiverCents: number | null;
  bank: string | null; brandTier: string | null; last4: string | null; printedName: string | null; modality: string | null; cardType: string | null; status: string;
  expMonth: number | null; expYear: number | null; limitCents: number | null; annualFeeMonth: number | null; cardColor: string | null;
  benefits: string[]; benefitsUrl: string | null; tags: string[]; notes: string | null;
  balancePoints: number; balanceDate: string | null; accountCpmCents: number | null; accountBalance: number; openFeeCents: number; received: number; invoices: Invoice[];
};
type Card = CardView;
type Reminder = { id: string; cardId: string; card: string; title: string; date: string; advanceDays: number; late: boolean };
const STATUS_TONE: Record<string, string> = { ACTIVE: "bg-emerald-500/15 text-emerald-300", BLOCKED: "bg-amber-500/15 text-amber-300", CANCELED: "bg-red-500/15 text-red-300", EXPIRED: "bg-panel2 text-muted" };

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

export function CardsClient({ cards, accounts, actions, stats, reminders, today: t0 }: { cards: Card[]; accounts: { id: string; label: string; holder: string }[]; actions: { cardId: string; card: string; invoiceId: string; dueDate: string; amountCents: number }[]; stats: Stats; reminders: Reminder[]; today: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Card | "new" | null>(null);
  const [q, setQ] = useState("");
  const [fBrand, setFBrand] = useState("");
  const [fProgram, setFProgram] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fBenefit, setFBenefit] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  useEffect(() => { try { if (localStorage.getItem("mm:cards-view") === "list") setView("list"); } catch {} }, []);
  const pickView = (v: "grid" | "list") => { setView(v); try { localStorage.setItem("mm:cards-view", v); } catch {} };
  const [invoiceFor, setInvoiceFor] = useState<Card | null>(null);
  const [registering, setRegistering] = useState<(Invoice & { card: Card }) | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [erro, setErro] = useState("");
  const newCard = () => setDialog("new");
  useEffect(() => {
    window.addEventListener("mm:new-card", newCard);
    return () => window.removeEventListener("mm:new-card", newCard);
  }, []);

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

  const term = q.trim().toLowerCase();
  const shown = cards.filter((c) =>
    (!term || [c.name, c.holder, c.printedName, c.bank, c.last4, c.program, ...c.tags].some((x) => (x ?? "").toLowerCase().includes(term))) &&
    (!fBrand || c.brand === fBrand) && (!fProgram || c.programId === fProgram) && (!fStatus || c.status === fStatus) && (!fBenefit || c.benefits.includes(fBenefit)));
  const programs = [...new Map(cards.map((c) => [c.programId, c.program])).entries()];
  const brands = [...new Set(cards.map((c) => c.brand).filter(Boolean))] as string[];
  const faceOf = (c: Card) => ({ ...c, holder: c.holder, color: c.cardColor || c.color });

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel2 text-muted"><CreditCard className="h-5 w-5" /></span>
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Central de Cartões</h1>
          <p className="text-sm text-muted">{cards.length} {cards.length === 1 ? "cartão cadastrado" : "cartões cadastrados"}</p>
        </div>
        <button type="button" className="btn-primary" onClick={newCard} disabled={accounts.length === 0} title={accounts.length === 0 ? "Cadastre antes uma conta em Programas" : undefined}><Plus className="h-4 w-4" />Novo cartão</button>
      </div>

      <div className="card mb-4 flex flex-wrap items-center gap-2 p-3">
        <label className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input h-9 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por apelido, titular, banco ou final..." aria-label="Buscar cartões" />
        </label>
        <select className="input h-9 w-auto" value={fBrand} onChange={(e) => setFBrand(e.target.value)} aria-label="Bandeira"><option value="">Todas as bandeiras</option>{(brands.length ? brands : Object.keys(BRANDS)).map((b) => <option key={b}>{b}</option>)}</select>
        <select className="input h-9 w-auto" value={fProgram} onChange={(e) => setFProgram(e.target.value)} aria-label="Programa"><option value="">Todos os programas</option>{programs.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        <select className="input h-9 w-auto" value={fStatus} onChange={(e) => setFStatus(e.target.value)} aria-label="Status"><option value="">Todos status</option>{Object.entries(CARD_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <select className="input h-9 w-auto" value={fBenefit} onChange={(e) => setFBenefit(e.target.value)} aria-label="Benefício"><option value="">Todos os benefícios</option>{ALL_BENEFITS.map((b) => <option key={b}>{b}</option>)}</select>
        <div className="inline-flex gap-0.5 rounded-lg border border-line bg-panel p-0.5" role="group" aria-label="Visualização">
          <button type="button" aria-pressed={view === "grid"} onClick={() => pickView("grid")} className={`rounded-md p-1.5 ${view === "grid" ? "bg-panel2 text-white" : "text-muted"}`} aria-label="Em cartões"><LayoutGrid className="h-4 w-4" /></button>
          <button type="button" aria-pressed={view === "list"} onClick={() => pickView("list")} className={`rounded-md p-1.5 ${view === "list" ? "bg-panel2 text-white" : "text-muted"}`} aria-label="Em lista"><List className="h-4 w-4" /></button>
        </div>
      </div>

      {cards.length === 0 ? (
        <Empty title="Nenhum cartão cadastrado" icon={<CreditCard className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{accounts.length === 0 ? "Cadastre primeiro uma conta em Programas para receber os pontos do cartão." : "Cadastre o primeiro cartão para acompanhar benefícios, lembretes, faturas e pontos."}</p>
          <button className="btn-primary" onClick={newCard} disabled={accounts.length === 0}><Plus className="h-4 w-4" />Cadastrar cartão</button>
        </Empty>
      ) : shown.length === 0 ? (
        <div className="card mb-4 py-10 text-center text-sm text-muted">Nenhum cartão com esses filtros.</div>
      ) : view === "grid" ? (
        <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((c) => (
            <div key={c.id} className="group">
              <button type="button" className="block w-full text-left transition-transform hover:-translate-y-0.5" onClick={() => setDialog(c)} aria-label={`Abrir ${c.name}`}><CardFace c={faceOf(c)} small /></button>
              <div className="mt-2 flex items-center gap-2 px-1 text-xs text-muted">
                <ProgramLogo programId={c.programId} name={c.program} color={c.color} version={c.logo} size={18} />
                <span className="min-w-0 flex-1 truncate">{c.program} · {shortName(c.holder)} · {c.pointsPerDollar.toLocaleString("pt-BR")} pts/US$</span>
                {c.benefits.length > 0 && <span title={c.benefits.join(", ")}>{c.benefits.length} benef.</span>}
                <RowMenu label={`Ações de ${c.name}`} items={[
                  { label: "Adicionar fatura", icon: <ReceiptText className="h-4 w-4" />, onClick: () => { setErro(""); setInvoiceFor(c); } },
                  { label: "Editar cartão", icon: <Pencil className="h-4 w-4" />, onClick: () => setDialog(c) },
                ]} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <section className="card mb-4 overflow-visible" aria-label="Cartões">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Cartão</th><th>Banco · bandeira</th><th>Final</th><th>Titular</th><th>Pontuação</th><th>Status</th><th className="w-12" /></tr></thead>
              <tbody>
                {shown.map((c) => (
                  <tr key={c.id} className="cursor-pointer hover:bg-panel2/40" onClick={() => setDialog(c)}>
                    <td><span className="flex items-center gap-2 font-medium"><span className="h-6 w-9 shrink-0 rounded" style={{ background: `linear-gradient(135deg, ${c.cardColor || c.color}, #0b0b12)` }} aria-hidden />{c.name}</span></td>
                    <td className="text-muted">{[c.bank, c.brandTier || c.brand].filter(Boolean).join(" · ") || "—"}{c.modality && <span className="block text-[11px]">{MODALITIES[c.modality as keyof typeof MODALITIES]}</span>}</td>
                    <td className="font-mono">{c.last4 ? `•••• ${c.last4}` : "—"}</td>
                    <td>{shortName(c.holder)}<span className="block text-[11px] text-muted">{c.program}</span></td>
                    <td className="whitespace-nowrap tabular-nums">{c.pointsPerDollar.toLocaleString("pt-BR")} pts/US$</td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[c.status] ?? ""}`}>{CARD_STATUS[c.status as keyof typeof CARD_STATUS] ?? c.status}</span></td>
                    <td className="text-right" onClick={(e) => e.stopPropagation()}>
                      <RowMenu label={`Ações de ${c.name}`} items={[
                        { label: "Adicionar fatura", icon: <ReceiptText className="h-4 w-4" />, onClick: () => { setErro(""); setInvoiceFor(c); } },
                        { label: "Editar cartão", icon: <Pencil className="h-4 w-4" />, onClick: () => setDialog(c) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {reminders.length > 0 && (
        <section className="card mb-4 overflow-hidden" aria-label="Lembretes dos cartões">
          <h2 className="flex items-center gap-2 border-b border-line px-5 py-3 font-semibold"><Bell className="h-4 w-4 text-muted" />Lembretes dos próximos 30 dias</h2>
          <ul className="divide-y divide-line">
            {reminders.map((r) => {
              const c = cards.find((x) => x.id === r.cardId);
              return (
                <li key={r.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                  <span className={`w-20 shrink-0 tabular-nums ${r.late ? "text-red-300" : r.date === t0 ? "text-amber-300" : "text-muted"}`}>{fmtDate(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.title}</span>
                  {c && <button type="button" className="text-xs text-accent-light hover:underline" onClick={() => setDialog(c)}>{r.card}</button>}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {cards.length > 0 && <h2 className="mb-3 mt-6 text-lg font-semibold">Faturas e pontos</h2>}
      {cards.length > 0 && <div className="mb-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {kpi("Pontos esperados", fmtPts(stats.expectedPoints), "Próximas faturas", "from-panel to-panel")}
        {kpi("Valor em aberto", fmtBRL(stats.openCents), "Próximas faturas", "from-panel to-panel")}
        {kpi("Pontos recebidos", fmtPts(stats.receivedPoints), "De todas as faturas", "from-panel to-panel")}
        {kpi("Ação necessária", `${stats.actionCards} de ${stats.totalCards}`, stats.actionCards ? (stats.actionCards === 1 ? "cartão precisa de atenção" : "cartões precisam de atenção") : "tudo em dia", stats.actionCards ? "from-panel to-amber-500/10" : "from-panel to-panel")}
      </div>}

      {first && (
        <section className="card mb-4 flex flex-wrap items-center gap-3 bg-gradient-to-r from-accent-soft/60 to-panel px-5 py-4" aria-label="Próximo passo">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Próximo passo</p>
            <p className="truncate text-sm text-muted">{first.card} · Fatura de {new Date(first.dueDate).toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {fmtBRL(first.amountCents)}</p>
          </div>
          <button type="button" className="btn-ghost h-9 bg-panel" onClick={() => { const i = all.find((x) => x.id === first.invoiceId); if (i) { setErro(""); setRegistering(i); } }}><Trophy className="h-4 w-4" />Registrar pontos</button>
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

      {dialog && <CardDialog key={dialog === "new" ? "novo" : dialog.id} card={dialog === "new" ? null : dialog} accounts={accounts} onClose={() => setDialog(null)} />}
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
            <Field label="Data do crédito" required><input className="input" type="date" name="date" required defaultValue={today()} /></Field>
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
