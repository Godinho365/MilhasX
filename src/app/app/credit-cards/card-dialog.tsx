"use client";
// Janela do cartão como na referência: prévia do plástico e abas Dados, Benefícios, Lembretes, Anexos e Atividade.
// Os campos de pontos (conta, pontos por dólar, fechamento, anuidade) continuam aqui, com a simulação do mês.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload, Download, Bell, MessageSquare, ExternalLink } from "lucide-react";
import { api, today } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, fmtDateTime, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { simulateMonth } from "@/domain/cards";
import { BANKS, BRANDS, MODALITIES, CARD_TYPES, CARD_STATUS, BENEFITS, REMINDER_KINDS, REMINDER_RECURRENCE, quickReminder, type ReminderKind } from "@/domain/card-catalog";
import type { CardView } from "./client";

const money = (c: number | null | undefined) => (c ? (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "");
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Plástico do cartão: cor própria (ou a do programa), banco, apelido, bandeira, final e validade. */
export function CardFace({ c, small }: { c: { name: string; bank?: string | null; brand?: string | null; brandTier?: string | null; last4?: string | null; printedName?: string | null; holder?: string; expMonth?: number | null; expYear?: number | null; color: string; status?: string }; small?: boolean }) {
  const off = c.status && c.status !== "ACTIVE";
  return (
    <div className={`relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl text-white shadow-lg ${small ? "p-4" : "p-6"} ${off ? "grayscale" : ""}`}
      style={{ background: `linear-gradient(135deg, ${c.color} 0%, ${c.color}cc 45%, #0b0b12 120%)`, color: "#fff" }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-widest opacity-75">{c.bank || "Banco"}</p>
          <p className={`truncate font-semibold ${small ? "text-sm" : "text-lg"}`}>{c.name || "Novo cartão"}</p>
        </div>
        <p className="shrink-0 text-right text-xs font-bold uppercase tracking-wide">{c.brand || "Bandeira"}{c.brandTier && <span className="block text-[10px] font-medium normal-case opacity-80">{c.brandTier}</span>}</p>
      </div>
      <p className={`font-mono tracking-[0.2em] ${small ? "text-sm" : "text-lg"}`}>•••• •••• •••• {c.last4 || "••••"}</p>
      <div className="flex items-end justify-between gap-2 text-[11px] uppercase">
        <span className="min-w-0"><span className="block text-[9px] opacity-70">Titular</span><span className="block truncate font-semibold">{c.printedName || c.holder || "—"}</span></span>
        <span className="text-right"><span className="block text-[9px] opacity-70">Validade</span><span className="font-semibold">{c.expMonth && c.expYear ? `${String(c.expMonth).padStart(2, "0")}/${String(c.expYear).slice(2)}` : "••/••"}</span></span>
      </div>
      {off && <span className="absolute right-3 top-1/2 -translate-y-1/2 rotate-[-12deg] rounded-md border-2 border-white/80 px-2 py-0.5 text-xs font-bold uppercase">{CARD_STATUS[c.status as keyof typeof CARD_STATUS]}</span>}
    </div>
  );
}

type Tab = "dados" | "beneficios" | "lembretes" | "anexos" | "atividade";
type Detail = { reminders: { id: string; kind: string; title: string; date: string; recurrence: string; advanceDays: number; whatsapp: boolean; note: string | null }[]; files: { id: string; name: string; size: number }[]; activity: { id: string; kind: string; text: string; createdAt: string }[] };

export function CardDialog({ card, accounts, onClose }: { card: CardView | null; accounts: { id: string; label: string; holder: string }[]; onClose: () => void }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("dados");
  const [f, setF] = useState({
    name: card?.name ?? "", accountId: card?.accountId ?? "", bank: card?.bank ?? "", brand: card?.brand ?? "Visa", brandTier: card?.brandTier ?? "", last4: card?.last4 ?? "",
    printedName: card?.printedName ?? "", modality: card?.modality ?? "", cardType: card?.cardType ?? "", status: card?.status ?? "ACTIVE",
    expMonth: card?.expMonth ? String(card.expMonth) : "", expYear: card?.expYear ? String(card.expYear) : "", limit: money(card?.limitCents), annualFeeMonth: card?.annualFeeMonth ? String(card.annualFeeMonth) : "",
    color: card?.cardColor ?? "", ppd: card ? String(card.pointsPerDollar).replace(".", ",") : "", rate: card ? money(card.dollarRateCents) : "5,50",
    closing: card ? String(card.closingDay) : "", due: card ? String(card.dueDay) : "", fee: money(card?.annualFeeCents), waiver: money(card?.feeWaiverCents),
    balance: card?.balancePoints ? fmtPts(card.balancePoints) : "", balanceDate: card?.balanceDate ?? today(),
    benefits: card?.benefits ?? [], benefitsUrl: card?.benefitsUrl ?? "", tags: (card?.tags ?? []).join(", "), notes: card?.notes ?? "",
  });
  const [spend, setSpend] = useState(card?.invoices[0] ? money(card.invoices[0].amountCents) : "5.000,00");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<Detail | null>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const load = async () => { if (card) { const r = await api<Detail>(`/api/cards/${card.id}/detail`); if (r.ok) setDetail(r.data); } };
  useEffect(() => { load(); }, [card?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const acc = accounts.find((a) => a.id === f.accountId);
  const faceColor = f.color || card?.color || "#3b3f9e";
  const rule = { pointsPerDollar: Math.round((Number(f.ppd.replace(",", ".")) || 0) * 100), dollarRateCents: parseBRLToCents(f.rate) ?? 0, annualFeeCents: parseBRLToCents(f.fee) ?? 0, feeWaiverCents: parseBRLToCents(f.waiver) || null };
  const sim = simulateMonth(rule, parseBRLToCents(spend) ?? 0);

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!f.name.trim()) { setTab("dados"); return setErro("Dê um apelido ao cartão"); }
    if (!f.accountId) { setTab("dados"); return setErro("Escolha a conta que recebe os pontos"); }
    const rate = parseBRLToCents(f.rate || "5,50"), fee = parseBRLToCents(f.fee || "0"), waiver = parseBRLToCents(f.waiver || "0"), limit = f.limit ? parseBRLToCents(f.limit) : null;
    if (rate === null || fee === null || waiver === null || (f.limit && limit === null)) { setTab("dados"); return setErro("Valor inválido"); }
    const body = {
      accountId: f.accountId, name: f.name, brand: f.brand || null, pointsPerDollar: rule.pointsPerDollar, dollarRateCents: rate,
      closingDay: Number(f.closing), dueDay: Number(f.due), annualFeeCents: fee, feeWaiverCents: waiver || null,
      bank: f.bank || null, brandTier: f.brandTier || null, last4: f.last4 || null, printedName: f.printedName || null,
      modality: f.modality || null, cardType: f.cardType || null, status: f.status,
      expMonth: f.expMonth ? Number(f.expMonth) : null, expYear: f.expYear ? Number(f.expYear) : null, limitCents: limit, annualFeeMonth: f.annualFeeMonth ? Number(f.annualFeeMonth) : null,
      color: f.color || null, benefits: f.benefits, benefitsUrl: f.benefitsUrl || null, tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean), notes: f.notes || null,
    };
    if (!body.closingDay || !body.dueDay) { setTab("dados"); return setErro("Informe os dias de fechamento e vencimento"); }
    setBusy(true);
    const r = card ? await api<{ item: { id: string } }>(`/api/cards/${card.id}`, "PUT", body) : await api<{ item: { id: string } }>("/api/cards", "POST", body);
    if (!r.ok) { setBusy(false); return setErro(r.erro); }
    // Pontos que o cartão já tem acumulados: viram "Saldo inicial" na conta que recebe os pontos
    const bal = Number(f.balance.replace(/\D/g, "")) || 0;
    if (bal !== (card?.balancePoints ?? 0) || (bal > 0 && f.balanceDate !== card?.balanceDate)) {
      const b = await api(`/api/cards/${r.data.item.id}/balance`, "PUT", { points: bal, date: f.balanceDate });
      if (!b.ok) { setBusy(false); return setErro(b.erro); }
    }
    setBusy(false);
    toast(card ? "Cartão salvo" : "Cartão cadastrado");
    onClose();
    refreshSafe(router);
  }
  async function remove() {
    if (!card || !(await confirmDialog({ title: `Excluir o cartão ${card.name}?`, body: "Os lembretes, anexos e a atividade dele também saem.", confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/cards/${card.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Cartão excluído");
    onClose();
    refreshSafe(router);
  }

  const tabs: [Tab, string, boolean][] = [["dados", "Dados", true], ["beneficios", "Benefícios", true], ["lembretes", "Lembretes", !!card], ["anexos", "Anexos", !!card], ["atividade", "Atividade", !!card]];
  const tiers = BRANDS[f.brand] ?? [];
  return (
    <Modal open onClose={onClose} size="lg" title={card ? "Editar cartão" : "Novo cartão"}
      footer={<>{card && <button type="button" className="btn-ghost mr-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}<button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="submit" form="card-form" className="btn-primary" disabled={busy}>{card ? "Salvar" : "Cadastrar cartão"}</button></>}>
      <p className="-mt-2 mb-3 text-xs text-muted">Benefícios, lembretes e anexos do cartão. Nunca guarde o número completo nem o CVV.</p>
      <div className="mx-auto max-w-md"><CardFace c={{ ...f, name: f.name, holder: acc?.holder, color: faceColor, expMonth: Number(f.expMonth) || null, expYear: Number(f.expYear) || null }} /></div>
      <div className="mt-4 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {tabs.map(([k, l, on]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} disabled={!on} title={on ? undefined : "Disponível depois de cadastrar o cartão"} onClick={() => setTab(k)}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${tab === k ? "border-accent-light text-white" : "border-transparent text-muted hover:text-zinc-100"} disabled:opacity-40`}>{l}</button>
        ))}
      </div>
      {erro && <div className="mt-3"><Alert>{erro}</Alert></div>}

      <form id="card-form" onSubmit={save} className={tab === "dados" ? "mt-4 grid gap-4 sm:grid-cols-2" : "hidden"}>
        <Field label="Apelido" required className="sm:col-span-2"><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} placeholder="Ex.: Nubank Ultravioleta da Ana" /></Field>
        <Field label="Banco emissor"><select className="input" value={f.bank} onChange={(e) => set({ bank: e.target.value })}><option value="">—</option>{BANKS.map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Bandeira" required><select className="input" value={f.brand} onChange={(e) => set({ brand: e.target.value, brandTier: "" })}>{Object.keys(BRANDS).map((b) => <option key={b}>{b}</option>)}</select></Field>
        <Field label="Categoria da bandeira"><select className="input" value={f.brandTier} onChange={(e) => set({ brandTier: e.target.value })}><option value="">—</option>{tiers.map((t) => <option key={t} value={`${f.brand} ${t}`}>{f.brand} {t}</option>)}</select></Field>
        <Field label="Últimos 4 dígitos"><input className="input font-mono" value={f.last4} onChange={(e) => set({ last4: e.target.value.replace(/\D/g, "").slice(0, 4) })} inputMode="numeric" placeholder="1234" /></Field>
        <Field label="Titular impresso" hint={acc ? `Vazio: ${acc.holder}` : undefined}><input className="input uppercase" value={f.printedName} onChange={(e) => set({ printedName: e.target.value })} maxLength={60} placeholder="NOME COMO NO CARTÃO" /></Field>
        <Field label="Conta que recebe os pontos" required hint="Titular e programa do cartão"><select className="input" value={f.accountId} onChange={(e) => set({ accountId: e.target.value })}><option value="" disabled>Selecione</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></Field>
        <Field label="Modalidade"><select className="input" value={f.modality} onChange={(e) => set({ modality: e.target.value })}><option value="">—</option>{Object.entries(MODALITIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Tipo"><select className="input" value={f.cardType} onChange={(e) => set({ cardType: e.target.value })}><option value="">—</option>{Object.entries(CARD_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Status"><select className="input" value={f.status} onChange={(e) => set({ status: e.target.value })}>{Object.entries(CARD_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fechamento (dia)" required><input className="input" type="number" min={1} max={31} value={f.closing} onChange={(e) => set({ closing: e.target.value })} /></Field>
          <Field label="Vencimento (dia)" required><input className="input" type="number" min={1} max={31} value={f.due} onChange={(e) => set({ due: e.target.value })} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Validade (mês)"><select className="input" value={f.expMonth} onChange={(e) => set({ expMonth: e.target.value })}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{String(i + 1).padStart(2, "0")}</option>)}</select></Field>
          <Field label="Validade (ano)"><input className="input" type="number" min={2000} max={2100} value={f.expYear} onChange={(e) => set({ expYear: e.target.value })} placeholder="2030" /></Field>
        </div>
        <Field label="Limite (R$)"><input className="input" inputMode="decimal" value={f.limit} onChange={(e) => set({ limit: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Cor do cartão" hint="Vazio: a cor do programa"><span className="flex items-center gap-2"><input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-panel" value={faceColor} onChange={(e) => set({ color: e.target.value })} aria-label="Cor do cartão" />{f.color && <button type="button" className="btn-subtle h-8 px-2 text-xs" onClick={() => set({ color: "" })}>Usar a do programa</button>}</span></Field>

        <fieldset className="grid gap-4 rounded-xl border border-line p-4 sm:col-span-2 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">Pontos e anuidade</legend>
          <Field label="Pontos por dólar" required><input className="input" inputMode="decimal" value={f.ppd} onChange={(e) => set({ ppd: e.target.value })} placeholder="2,2" /></Field>
          <Field label="Cotação do dólar (R$)" hint="Usada para estimar os pontos"><input className="input" inputMode="decimal" value={f.rate} onChange={(e) => set({ rate: e.target.value })} /></Field>
          <Field label="Anuidade (R$ por ano)" hint="Em 12 parcelas; cada uma vira custo dos pontos da fatura"><input className="input" inputMode="decimal" value={f.fee} onChange={(e) => set({ fee: e.target.value })} placeholder="0,00" /></Field>
          <Field label="Mês da anuidade"><select className="input" value={f.annualFeeMonth} onChange={(e) => set({ annualFeeMonth: e.target.value })}><option value="">—</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
          <Field label="Isenta gastando (R$ por mês)" hint="Vazio: sem isenção"><input className="input" inputMode="decimal" value={f.waiver} onChange={(e) => set({ waiver: e.target.value })} placeholder="8.000,00" /></Field>
          <Field label="Pontos já acumulados no cartão" hint="Entram como “Saldo inicial” na conta"><input className="input" inputMode="numeric" value={f.balance} onChange={(e) => set({ balance: e.target.value })} placeholder="0" /></Field>
          <Field label="Data do saldo"><input className="input" type="date" value={f.balanceDate} onChange={(e) => set({ balanceDate: e.target.value })} /></Field>
          <div className="flex flex-wrap items-end gap-3 sm:col-span-2" aria-label="Simulação do mês">
            <Field label="Se eu gastar no mês (R$)" className="w-44"><input className="input" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} aria-label="Gasto no mês" /></Field>
            <dl className="grid flex-1 grid-cols-3 gap-2 text-sm">
              <div><dt className="kicker">Pontos</dt><dd className="font-semibold tabular-nums">{fmtPts(sim.points)}</dd></div>
              <div><dt className="kicker">Anuidade no mês</dt><dd className="font-semibold tabular-nums">{rule.annualFeeCents <= 0 ? "—" : sim.waived ? "Isenta" : fmtBRL(sim.feeCents)}</dd></div>
              <div><dt className="kicker">CPM da anuidade</dt><dd className="font-semibold tabular-nums">{sim.cpmCents > 0 ? fmtBRL(sim.cpmCents) : "R$ 0,00"}</dd></div>
            </dl>
          </div>
        </fieldset>
        <Field label="Tags" hint="Separe por vírgula" className="sm:col-span-2"><input className="input" value={f.tags} onChange={(e) => set({ tags: e.target.value })} placeholder="viagem, principal" /></Field>
        <Field label="Notas" className="sm:col-span-2"><textarea className="input min-h-[72px]" value={f.notes} onChange={(e) => set({ notes: e.target.value })} maxLength={2000} /></Field>
      </form>

      {tab === "beneficios" && (
        <div className="mt-4 space-y-4">
          <Field label="Link dos benefícios" hint="Página oficial do banco com os benefícios do cartão"><span className="flex gap-2"><input className="input" value={f.benefitsUrl} onChange={(e) => set({ benefitsUrl: e.target.value })} placeholder="https://" />{/^https?:\/\//.test(f.benefitsUrl) && <a className="btn-ghost h-10 border border-line" href={f.benefitsUrl} target="_blank" rel="noreferrer" aria-label="Abrir link dos benefícios"><ExternalLink className="h-4 w-4" /></a>}</span></Field>
          {Object.entries(BENEFITS).map(([g, items]) => (
            <fieldset key={g}>
              <legend className="mb-1.5 text-sm font-medium">{g}</legend>
              <div className="flex flex-wrap gap-1.5">
                {items.map((b) => {
                  const on = f.benefits.includes(b);
                  return <button key={b} type="button" aria-pressed={on} onClick={() => set({ benefits: on ? f.benefits.filter((x) => x !== b) : [...f.benefits, b] })} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-accent-light bg-accent-soft/50 text-white" : "border-line text-muted hover:text-zinc-100"}`}>{b}</button>;
                })}
              </div>
            </fieldset>
          ))}
          <p className="text-xs text-muted">{f.benefits.length} {f.benefits.length === 1 ? "benefício selecionado" : "benefícios selecionados"}. Salve o cartão para guardar.</p>
        </div>
      )}
      {tab === "lembretes" && card && <Reminders card={card} f={f} detail={detail} onChange={load} />}
      {tab === "anexos" && card && <Files cardId={card.id} detail={detail} onChange={load} />}
      {tab === "atividade" && card && <Activity cardId={card.id} detail={detail} onChange={load} />}
    </Modal>
  );
}

function Reminders({ card, f, detail, onChange }: { card: CardView; f: { name: string; due: string; closing: string; annualFeeMonth: string; expMonth: string; expYear: string }; detail: Detail | null; onChange: () => void }) {
  const [form, setForm] = useState<null | { kind: ReminderKind; title: string; date: string; recurrence: string; advanceDays: string; whatsapp: boolean; note: string }>(null);
  const [erro, setErro] = useState("");
  function pick(kind: ReminderKind) {
    const q = quickReminder(kind, { name: f.name || card.name, dueDay: Number(f.due) || card.dueDay, closingDay: Number(f.closing) || card.closingDay, annualFeeMonth: Number(f.annualFeeMonth) || null, expMonth: Number(f.expMonth) || null, expYear: Number(f.expYear) || null }, today());
    setErro("");
    setForm({ kind, title: q.title, date: q.date, recurrence: q.recurrence, advanceDays: String(q.advanceDays), whatsapp: false, note: "" });
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const r = await api(`/api/cards/${card.id}/reminders`, "POST", { ...form, advanceDays: Number(form.advanceDays) || 0, note: form.note || null });
    if (!r.ok) return setErro(r.erro);
    toast("Lembrete adicionado");
    setForm(null);
    onChange();
  }
  async function del(id: string) {
    const r = await api(`/api/cards/${card.id}/reminders/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    onChange();
  }
  const list = detail?.reminders ?? [];
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="kicker mb-2">Novo lembrete rápido</p>
        <div className="flex flex-wrap gap-1.5">{(Object.keys(REMINDER_KINDS) as ReminderKind[]).map((k) => <button key={k} type="button" aria-pressed={form?.kind === k} className={`rounded-full border px-3 py-1 text-xs ${form?.kind === k ? "border-accent-light bg-accent-soft/50 text-white" : "border-line text-muted hover:text-zinc-100"}`} onClick={() => pick(k)}>{REMINDER_KINDS[k]}</button>)}</div>
      </div>
      {form && (
        <form onSubmit={add} className="grid gap-3 rounded-xl border border-line bg-panel2/40 p-3 sm:grid-cols-2" aria-label="Novo lembrete">
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          <Field label="Título" className="sm:col-span-2"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} maxLength={120} required autoFocus /></Field>
          <Field label="Data"><input className="input" type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required /></Field>
          <Field label="Recorrência"><select className="input" value={form.recurrence} onChange={(e) => setForm({ ...form, recurrence: e.target.value })}>{Object.entries(REMINDER_RECURRENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          <Field label="Antecedência (dias)"><input className="input" type="number" min={0} max={90} value={form.advanceDays} onChange={(e) => setForm({ ...form, advanceDays: e.target.value })} /></Field>
          <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" className="checkbox" checked={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.checked })} />Avisar também por WhatsApp</label>
          <Field label="Observação" className="sm:col-span-2"><input className="input" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} maxLength={500} /></Field>
          <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancelar</button><button className="btn-primary">Adicionar lembrete</button></div>
        </form>
      )}
      <div>
        <p className="kicker mb-2">Lembretes deste cartão ({list.length})</p>
        {list.length === 0 ? <p className="rounded-xl border border-dashed border-line py-6 text-center text-sm text-muted">Nenhum lembrete. Use os botões acima para criar rapidamente.</p> : (
          <ul className="divide-y divide-line rounded-xl border border-line">
            {list.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <Bell className="h-4 w-4 shrink-0 text-muted" />
                <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.title}</span><span className="text-xs text-muted">{fmtDate(r.date)} · {REMINDER_RECURRENCE[r.recurrence as keyof typeof REMINDER_RECURRENCE]}{r.advanceDays ? ` · avisa ${r.advanceDays} ${r.advanceDays === 1 ? "dia" : "dias"} antes` : ""}{r.whatsapp ? " · WhatsApp" : ""}</span></span>
                <button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => del(r.id)} aria-label={`Excluir lembrete ${r.title}`}><Trash2 className="h-3.5 w-3.5" /></button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Files({ cardId, detail, onChange }: { cardId: string; detail: Detail | null; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  async function upload(files: FileList | null) {
    for (const file of [...(files ?? [])]) {
      const r = await fetch(`/api/cards/${cardId}/files`, { method: "POST", headers: { "x-file-name": encodeURIComponent(file.name) }, body: file });
      const j = (await r.json().catch(() => ({}))) as { erro?: string };
      if (!r.ok) toast(j.erro ?? "Não foi possível enviar", "error");
    }
    onChange();
  }
  async function del(id: string, name: string) {
    if (!(await confirmDialog({ title: `Excluir ${name}?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/cards/${cardId}/files/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    onChange();
  }
  const list = detail?.files ?? [];
  return (
    <div className="mt-4 space-y-3">
      <button type="button" onClick={() => ref.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files); }}
        className={`flex w-full flex-col items-center gap-1 rounded-xl border border-dashed px-4 py-6 text-sm ${drag ? "border-accent-light bg-accent-soft/30" : "border-line text-muted hover:text-zinc-100"}`}>
        <Upload className="h-5 w-5" />Solte arquivos aqui ou clique para enviar
        <span className="text-xs text-muted">Foto do cartão (sem o número completo), contrato, cartilha de benefícios. Imagem ou PDF até 10 MB.</span>
      </button>
      <input ref={ref} type="file" multiple accept="image/*,application/pdf" className="hidden" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
      <p className="kicker">Anexos ({list.length})</p>
      {list.length === 0 ? <p className="text-sm text-muted">Nenhum anexo ainda.</p> : (
        <ul className="space-y-1">{list.map((x) => <li key={x.id} className="flex items-center gap-2 rounded-lg bg-panel2/60 px-3 py-1.5 text-sm"><span className="flex-1 truncate">{x.name}</span><span className="text-xs text-muted">{Math.ceil(x.size / 1024)} KB</span><a href={`/api/cards/${cardId}/files/${x.id}`} className="btn-subtle h-7 w-7 px-0" aria-label={`Baixar ${x.name}`}><Download className="h-3.5 w-3.5" /></a><button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => del(x.id, x.name)} aria-label={`Excluir ${x.name}`}><Trash2 className="h-3.5 w-3.5" /></button></li>)}</ul>
      )}
    </div>
  );
}

function Activity({ cardId, detail, onChange }: { cardId: string; detail: Detail | null; onChange: () => void }) {
  const [text, setText] = useState("");
  async function send() {
    if (!text.trim()) return;
    const r = await api(`/api/cards/${cardId}/comments`, "POST", { text });
    if (!r.ok) return toast(r.erro, "error");
    setText("");
    onChange();
  }
  const list = detail?.activity ?? [];
  return (
    <div className="mt-4 space-y-3">
      <div className="flex gap-2">
        <textarea className="input min-h-[44px] flex-1" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} maxLength={2000} placeholder="Anote algo sobre o cartão..." aria-label="Comentário" />
        <button type="button" className="btn-primary self-end" onClick={send} disabled={!text.trim()}>Publicar</button>
      </div>
      <p className="kicker">Atividade ({list.length})</p>
      {list.length === 0 ? <p className="text-sm text-muted">Nenhuma atividade registrada.</p> : (
        <ul className="space-y-2 text-sm">
          {list.map((a) => (
            <li key={a.id} className={a.kind === "COMMENT" ? "rounded-lg bg-panel2/60 px-3 py-2" : "flex items-center gap-2 text-xs text-muted"}>
              {a.kind === "COMMENT" ? <><p className="flex items-center gap-1.5 text-[11px] text-muted"><MessageSquare className="h-3 w-3" />{fmtDateTime(a.createdAt)}</p><p className="whitespace-pre-wrap">{a.text}</p></> : <><span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />{a.text} · {fmtDateTime(a.createdAt)}</>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
