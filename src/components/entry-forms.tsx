"use client";
// "Novo lançamento": menu (Crédito / Débito / Transferência / Lote) e os formulários de cada tipo,
// seguindo o desenho da referência (ver docs/novo-lancamento.md).
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useMemo, useState } from "react";
import {
  Plus, X, ArrowUpRight, ArrowDownRight, ArrowLeftRight, Upload, History, Trash2, Receipt, FileText, Settings2, ChevronLeft,
} from "lucide-react";
import { api, newKey, today } from "@/lib/api";
import { parseBRLToCents, fmtBRL, fmtPts } from "@/lib/format";
import { MANUAL_CREDIT_TYPES, MANUAL_DEBIT_TYPES, ENTRY_LABELS, type EntryType } from "@/domain/ledger";
import { planCost, scaleCosts } from "@/domain/installments";
import { costTypesFor, DETAILS_BY_TYPE, redemptionValueCpm, type CostType } from "@/domain/costs";
import { AIRPORTS } from "@/domain/airports";
import { Modal, Field, Alert } from "./ui";
import { ProgramLogo } from "./program-logo";
import { toast, confirmDialog } from "./feedback";
import {
  Collapsible, Switch, PointsInput, AccountSelect, CostRows, costsPayload, emptyCost, parsePts, accountLabel,
  PaymentFields, emptyPay, toPlan, paymentDetail, type PayState,
  type AccountOpt, type CardOpt, type CostRow,
} from "./form-parts";

export type { AccountOpt };
export type StoreOpt = { id: string; name: string };
export type FormKind = "credit" | "debit" | "transfer" | "batch";

/** Dados para abrir um formulário já preenchido ("Duplicar" no extrato). */
export type Prefill = { accountId: string; type: EntryType; points: number; description: string; costs: { type: string; amountCents: number; cardId: string | null }[] };

/** Abre um formulário de lançamento de qualquer lugar da interface (opcionalmente preenchido). */
export const openEntryForm = (kind: FormKind, prefill?: Prefill) => window.dispatchEvent(new CustomEvent("mm:new-entry", { detail: { kind, prefill } }));

const toCostRows = (p?: Prefill): CostRow[] =>
  p?.costs.length ? p.costs.map((c) => ({ type: c.type as CostType, amount: (c.amountCents / 100).toFixed(2).replace(".", ","), cardId: c.cardId ?? "" })) : [emptyCost()];

const cpm = (cost: number, pts: number) => (pts > 0 ? Math.round((cost * 1000) / pts) : 0);

/** Fechar com dados preenchidos pede confirmação, como na referência. */
async function confirmDiscard(dirty: boolean) {
  if (!dirty) return true;
  return confirmDialog({ title: "Descartar alterações?", body: "Os dados preenchidos serão perdidos.", confirmLabel: "Descartar", danger: true });
}

/** Botão flutuante de outra ação da página (ex.: "Novo titular", "Simular"), no lugar do "Novo lançamento". */
export type PageFab = { label: string; event: string; icon: React.ReactNode };

export function EntryForms({ accounts, defaultAccountId, cards = [], stores = [], fab }: { accounts: AccountOpt[]; defaultAccountId?: string; cards?: CardOpt[]; stores?: StoreOpt[]; fab?: PageFab | null }) {
  // Conta já escolhida: a da página da conta ou, se o titular só tem uma, essa
  const preset = defaultAccountId ?? (accounts.length === 1 ? accounts[0]!.id : undefined);
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<FormKind | null>(null);
  const [prefill, setPrefill] = useState<Prefill | undefined>();

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ kind: FormKind; prefill?: Prefill }>).detail;
      setMenu(false);
      setPrefill(d.prefill);
      setForm(d.kind);
    };
    window.addEventListener("mm:new-entry", onOpen);
    return () => window.removeEventListener("mm:new-entry", onOpen);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  const items: { kind: FormKind; label: string; sub: string; icon: React.ReactNode; tone: string }[] = [
    { kind: "credit", label: "Crédito", sub: "Acúmulo de pontos", icon: <ArrowUpRight className="h-5 w-5" />, tone: "bg-green-500/15 text-green-400" },
    { kind: "debit", label: "Débito", sub: "Resgate de pontos", icon: <ArrowDownRight className="h-5 w-5" />, tone: "bg-red-500/15 text-red-400" },
    { kind: "transfer", label: "Transferência", sub: "Entre programas", icon: <ArrowLeftRight className="h-5 w-5" />, tone: "bg-blue-500/15 text-blue-400" },
    { kind: "batch", label: "Lote", sub: "Adicionar vários", icon: <Upload className="h-5 w-5" />, tone: "bg-violet-500/15 text-violet-400" },
  ];
  const disabled = accounts.length === 0;
  const close = () => setForm(null);

  return (
    <>
      {menu && <div className="fixed inset-0 z-30 animate-fade-in bg-black/50 backdrop-blur-md" onClick={() => setMenu(false)} />}
      <div className="fixed bottom-[84px] right-4 z-40 flex flex-col items-end gap-3 sm:right-6 lg:bottom-5">
        {menu && (
          <div role="menu" aria-label="Tipo de lançamento" className="flex flex-col gap-2">
            {items.map((it, i) => (
              <button
                key={it.kind}
                role="menuitem"
                onClick={() => { setMenu(false); setForm(it.kind); }}
                className="flex w-56 animate-pop-in items-center gap-3 rounded-2xl border border-line bg-panel px-3 py-2.5 text-left shadow-xl shadow-black/40 hover:bg-panel2"
                style={{ animationDelay: `${(items.length - i) * 25}ms` }}
              >
                <span className={`flex h-9 w-9 items-center justify-center rounded-full ${it.tone}`}>{it.icon}</span>
                <span>
                  <span className="block text-sm font-semibold">{it.label}</span>
                  <span className="block text-xs text-muted">{it.sub}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {fab ? (
          <button onClick={() => window.dispatchEvent(new Event(fab.event))} aria-label={fab.label} className="btn-primary h-14 w-14 rounded-full px-0 shadow-lg shadow-blue-950/60 sm:h-12 sm:w-auto sm:px-5">
            {fab.icon}
            <span className="hidden sm:inline">{fab.label}</span>
          </button>
        ) : (
        <button
          onClick={() => setMenu((m) => !m)}
          disabled={disabled}
          aria-expanded={menu}
          aria-label={menu ? "Fechar menu de novo lançamento" : "Abrir menu de novo lançamento"}
          title={disabled ? "Cadastre um titular e uma conta em Programas" : undefined}
          className="btn-primary h-14 w-14 rounded-full px-0 shadow-lg shadow-blue-950/60 sm:h-12 sm:w-auto sm:px-5"
        >
          {menu ? <X className="h-5 w-5" /> : <Plus className="h-5 w-5" />}
          <span className="hidden sm:inline">Novo lançamento</span>
        </button>
        )}
      </div>
      {form === "credit" && <CreditForm accounts={accounts} cards={cards} stores={stores} onClose={close} prefill={prefill} preset={preset} />}
      {form === "debit" && <DebitForm accounts={accounts} cards={cards} onClose={close} prefill={prefill} preset={preset} />}
      {form === "transfer" && <TransferForm accounts={accounts} onClose={close} preset={preset} />}
      {form === "batch" && <BatchForm accounts={accounts} onClose={close} />}
    </>
  );
}

/* ============================== Crédito ============================== */

type Recent = { accountId: string; type: EntryType; points: number; costCents: number; description: string; account: string };
const FREQS = [["MONTHLY", "Mensal"], ["WEEKLY", "Semanal"], ["DAILY", "Diário"], ["YEARLY", "Anual"]] as const;

function CreditForm({ accounts, cards, stores, onClose, prefill, preset }: { accounts: AccountOpt[]; cards: CardOpt[]; stores: StoreOpt[]; onClose: () => void; prefill?: Prefill; preset?: string }) {
  const router = useRouter();
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [f, setF] = useState({ accountId: prefill?.accountId ?? preset ?? "", type: (prefill?.type ?? "") as EntryType | "", storeId: "", points: prefill ? fmtPts(prefill.points) : "", date: today(), description: prefill?.description ?? "" });
  const [costsOpen, setCostsOpen] = useState(!!prefill?.costs.length);
  const [costs, setCosts] = useState<CostRow[]>(() => toCostRows(prefill));
  const [repeat, setRepeat] = useState(false);
  const [rec, setRec] = useState({ frequency: "MONTHLY" as (typeof FREQS)[number][0], advanced: false, dayOfMonth: "", interval: "1", endDate: "", skipWeekends: false });
  const [pay, setPay] = useState<PayState>(emptyPay);

  useEffect(() => {
    api<{ items: Recent[] }>("/api/entries/recent?direction=credit").then((r) => r.ok && setRecent(r.data.items));
  }, []);

  const types = f.type ? costTypesFor(f.type) : [];
  const update = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setDirty(true); };
  function pickType(t: EntryType) {
    update({ type: t, storeId: t === "PARTNER_PURCHASE" ? f.storeId : "" });
    const allowed = costTypesFor(t);
    // Compra de pontos já vem com o tipo "Pontos" sugerido, como na referência
    setCosts((rows) => rows.map((r, i) => ({ ...r, type: r.type && allowed.includes(r.type as CostType) ? r.type : i === 0 && t === "PURCHASE" ? "PONTOS" : "" })));
    if (t !== "CLUB") setRepeat(false);
  }
  const points = parsePts(f.points);
  const { items: costItems } = costsPayload(costs);
  const nominalCost = costItems.reduce((t, c) => t + c.amountCents, 0);
  // parcelado com antecipação: o custo que entra no CPM é o que de fato foi pago
  const totalCost = planCost(nominalCost, toPlan(pay)).effectiveCents;
  const acc = accounts.find((a) => a.id === f.accountId);
  const dayOfDate = Number(f.date.slice(8, 10));

  async function requestClose() {
    if (await confirmDiscard(dirty)) onClose();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.accountId) return setErro("Escolha o programa");
    if (!f.type) return setErro("Escolha a categoria");
    if (points <= 0) return setErro("Informe os pontos");
    const c = costsPayload(costs);
    if (c.erro) return setErro(c.erro);
    const plan = toPlan(pay);
    if (pay.installments > 1 && pay.anticipate && (plan.payoffCents == null || plan.payoffCents > planCost(nominalCost, plan).restCents)) return setErro("Valor para quitar as parcelas inválido");
    const payment = paymentDetail(pay, nominalCost);
    setBusy(true);
    setErro("");
    const r = await api("/api/entries", "POST", {
      accountId: f.accountId, type: f.type, points, occurredAt: f.date, description: f.description || undefined,
      storeId: f.storeId || null, costs: scaleCosts(c.items, totalCost), idempotencyKey: key,
      details: payment ? { payment } : undefined,
      recurrence: repeat
        ? { frequency: rec.frequency, interval: Number(rec.interval) || 1, dayOfMonth: rec.dayOfMonth ? Number(rec.dayOfMonth) : null, endDate: rec.endDate || null, skipWeekends: rec.skipWeekends }
        : null,
    });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(repeat ? "Recorrência criada" : "Crédito registrado");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal
      open
      onClose={requestClose}
      title="Novo crédito"
      footer={<><button type="button" className="btn-ghost" onClick={requestClose}>Cancelar</button><button form="credit-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : repeat ? "Criar recorrência" : "Criar lançamento"}</button></>}
    >
      <form id="credit-form" onSubmit={submit} className="space-y-5">
        {recent.length > 0 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Lançamentos recentes">
            <History className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            {recent.map((r, i) => (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setF({ ...f, accountId: r.accountId, type: r.type, points: fmtPts(r.points), description: r.description });
                  if (r.costCents) {
                    setCosts([{ type: costTypesFor(r.type)[0] ?? "", amount: (r.costCents / 100).toFixed(2).replace(".", ","), cardId: "" }]);
                    setCostsOpen(true);
                  }
                  setDirty(true);
                }}
                className="flex shrink-0 items-center gap-2 rounded-full border border-line bg-panel2 px-3 py-1 text-xs hover:border-zinc-500"
                title={`${r.description} — ${r.account}`}
              >
                <span className="max-w-[160px] truncate font-medium">{r.description}</span>
                <span className="text-muted">{fmtPts(r.points)}</span>
              </button>
            ))}
          </div>
        )}
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Programa" required><AccountSelect accounts={accounts} value={f.accountId} onChange={(v) => update({ accountId: v })} /></Field>
          <Field label="Categoria" required>
            <select className="input" value={f.type} onChange={(e) => pickType(e.target.value as EntryType)}>
              <option value="" disabled>Selecione</option>
              {MANUAL_CREDIT_TYPES.map((t) => <option key={t} value={t}>{ENTRY_LABELS[t]}</option>)}
            </select>
          </Field>
          {f.type === "PARTNER_PURCHASE" && (
            <Field label="Loja parceira" className="sm:col-span-2">
              <select className="input" value={f.storeId} onChange={(e) => update({ storeId: e.target.value })}>
                <option value="">Selecionar loja</option>
                {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          <Field label="Pontos" required><PointsInput value={f.points} onChange={(v) => update({ points: v })} /></Field>
          <Field label="Data" required><input className="input" type="date" value={f.date} onChange={(e) => update({ date: e.target.value })} required /></Field>
          <Field label="Descrição" className="sm:col-span-2"><input className="input" placeholder="Informar descrição" maxLength={200} value={f.description} onChange={(e) => update({ description: e.target.value })} /></Field>
        </div>

        {f.type && (
          <Collapsible
            icon={<Receipt className="h-4 w-4" />}
            title="Custos"
            subtitle="Quanto você pagou por estes pontos"
            open={costsOpen}
            onToggle={() => setCostsOpen((o) => !o)}
            right={!costsOpen && totalCost > 0 ? <span className="text-sm font-semibold tabular-nums">{fmtBRL(totalCost)}</span> : undefined}
          >
            <CostRows rows={costs} setRows={(r) => { setCosts(r); setDirty(true); }} types={types} cards={cards} />
            {nominalCost > 0 && <div className="mt-3"><PaymentFields totalCents={nominalCost} value={pay} onChange={(p) => { setPay(p); setDirty(true); }} /></div>}
          </Collapsible>
        )}

        {f.type === "CLUB" && (
          <section className="space-y-4 rounded-2xl border border-line p-4">
            <Switch
              checked={repeat}
              onChange={(v) => { setRepeat(v); setDirty(true); }}
              label="Repetir automaticamente"
              hint={repeat && rec.frequency === "MONTHLY" ? `Todo dia ${rec.dayOfMonth || dayOfDate} de cada mês` : "Lança este crédito a cada renovação do clube"}
            />
            {repeat && (
              <>
                <div>
                  <span className="label">Frequência</span>
                  <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Frequência">
                    {FREQS.map(([k, l]) => (
                      <button key={k} type="button" role="tab" aria-selected={rec.frequency === k} onClick={() => setRec({ ...rec, frequency: k })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${rec.frequency === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-light hover:underline" onClick={() => setRec({ ...rec, advanced: !rec.advanced })} aria-expanded={rec.advanced}>
                  <Settings2 className="h-4 w-4" />Opções avançadas
                </button>
                {rec.advanced && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {rec.frequency === "MONTHLY" && (
                      <Field label="Dia do mês" hint={`Em branco, repete todo dia ${dayOfDate}, o dia da data do lançamento.`}>
                        <input className="input" type="number" min={1} max={31} placeholder="Ex: 5" value={rec.dayOfMonth} onChange={(e) => setRec({ ...rec, dayOfMonth: e.target.value })} />
                      </Field>
                    )}
                    <Field label="Intervalo" hint="A cada quantos períodos repetir"><input className="input" type="number" min={1} max={365} placeholder="Ex: 1" value={rec.interval} onChange={(e) => setRec({ ...rec, interval: e.target.value })} /></Field>
                    <Field label="Data de término"><input className="input" type="date" value={rec.endDate} onChange={(e) => setRec({ ...rec, endDate: e.target.value })} /></Field>
                    <div className="flex items-end pb-2"><Switch checked={rec.skipWeekends} onChange={(v) => setRec({ ...rec, skipWeekends: v })} label="Pular finais de semana" /></div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {acc && points > 0 && (
          <p className="rounded-xl bg-panel2 px-4 py-3 text-sm text-muted">
            Saldo vai para <b className="text-white">{fmtPts(acc.balance + points)}</b> pts.
            {totalCost > 0 && <> CPM deste lançamento: <b className="text-white">{fmtBRL(cpm(totalCost, points))}</b>. CPM médio da conta: <b className="text-white">{fmtBRL(cpm(acc.costCents + totalCost, acc.balance + points))}</b>.</>}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ============================== Débito ============================== */

function AirportInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const listId = `airports-${label}`;
  const [text, setText] = useState(value);
  return (
    <Field label={label}>
      <input
        className="input"
        list={listId}
        placeholder="Selecione o aeroporto"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const code = e.target.value.trim().slice(0, 3).toUpperCase();
          onChange(AIRPORTS.some((a) => a.code === code) ? code : "");
        }}
        aria-label={label}
      />
      <datalist id={listId}>
        {AIRPORTS.map((a) => <option key={a.code} value={`${a.code} — ${a.city} (${a.name})`} />)}
      </datalist>
    </Field>
  );
}

function DebitForm({ accounts, cards, onClose, prefill, preset }: { accounts: AccountOpt[]; cards: CardOpt[]; onClose: () => void; prefill?: Prefill; preset?: string }) {
  const router = useRouter();
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [dirty, setDirty] = useState(false);
  const [f, setF] = useState({ accountId: prefill?.accountId ?? preset ?? "", type: (prefill?.type ?? "") as EntryType | "", points: prefill ? fmtPts(prefill.points) : "", date: today() });
  const [costsOpen, setCostsOpen] = useState(!!prefill?.costs.length);
  const [infoOpen, setInfoOpen] = useState(false);
  const [costs, setCosts] = useState<CostRow[]>(() => toCostRows(prefill));
  const [d, setD] = useState({ cashReference: "", passengers: "", reservation: "", origin: "", destination: "", description: prefill?.description ?? "", startDate: "", endDate: "" });

  const update = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setDirty(true); };
  const ud = (patch: Partial<typeof d>) => { setD({ ...d, ...patch }); setDirty(true); };
  function pickType(t: EntryType) {
    update({ type: t });
    const allowed = costTypesFor(t);
    setCosts((rows) => rows.map((r, i) => ({ ...r, type: r.type && allowed.includes(r.type as CostType) ? r.type : i === 0 && t === "FLIGHT_REDEMPTION" ? "TAXA_EMBARQUE" : "" })));
  }
  const types = f.type ? costTypesFor(f.type) : [];
  const details = f.type ? DETAILS_BY_TYPE[f.type] : undefined;
  const points = parsePts(f.points);
  const acc = accounts.find((a) => a.id === f.accountId);
  const paid = costsPayload(costs).items.reduce((t, c) => t + c.amountCents, 0);
  const cashRef = parseBRLToCents(d.cashReference) ?? 0;
  const valueCpm = redemptionValueCpm(cashRef, paid, points);
  const has = (k: string) => details?.fields.includes(k as never);

  async function requestClose() {
    if (await confirmDiscard(dirty)) onClose();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.accountId) return setErro("Escolha o programa");
    if (!f.type) return setErro("Escolha a categoria");
    if (points <= 0) return setErro("Informe os pontos");
    const c = costsPayload(costs);
    if (c.erro) return setErro(c.erro);
    if (d.cashReference && parseBRLToCents(d.cashReference) === null) return setErro("Valor de referência inválido");
    const detailsPayload = details
      ? {
          cashReferenceCents: d.cashReference ? parseBRLToCents(d.cashReference) : null,
          passengers: has("passengers") && d.passengers ? Number(d.passengers) : null,
          reservation: has("reservation") ? d.reservation || null : null,
          origin: has("origin") ? d.origin || null : null,
          destination: has("destination") ? d.destination || null : null,
          startDate: has("startDate") ? d.startDate || null : null,
          endDate: has("endDate") ? d.endDate || null : null,
        }
      : null;
    setBusy(true);
    setErro("");
    const r = await api("/api/entries", "POST", {
      accountId: f.accountId, type: f.type, points, occurredAt: f.date, description: d.description || undefined,
      costs: types.length ? c.items : undefined, details: detailsPayload, idempotencyKey: key,
    });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Débito registrado");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal
      open
      onClose={requestClose}
      title="Novo débito"
      footer={<><button type="button" className="btn-ghost" onClick={requestClose}>Cancelar</button><button form="debit-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Criar lançamento"}</button></>}
    >
      <form id="debit-form" onSubmit={submit} className="space-y-5">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Programa" required><AccountSelect accounts={accounts} value={f.accountId} onChange={(v) => update({ accountId: v })} /></Field>
          <Field label="Categoria" required>
            <select className="input" value={f.type} onChange={(e) => pickType(e.target.value as EntryType)}>
              <option value="" disabled>Selecione</option>
              {MANUAL_DEBIT_TYPES.map((t) => <option key={t} value={t}>{ENTRY_LABELS[t]}</option>)}
            </select>
          </Field>
          <Field label="Pontos" required><PointsInput value={f.points} onChange={(v) => update({ points: v })} /></Field>
          <Field label="Data" required><input className="input" type="date" value={f.date} onChange={(e) => update({ date: e.target.value })} required /></Field>
        </div>

        {types.length > 0 && (
          <Collapsible icon={<Receipt className="h-4 w-4" />} title="Custos" subtitle="Detalhe os custos deste resgate" open={costsOpen} onToggle={() => setCostsOpen((o) => !o)} right={!costsOpen && paid > 0 ? <span className="text-sm font-semibold tabular-nums">{fmtBRL(paid)}</span> : undefined}>
            <CostRows rows={costs} setRows={(r) => { setCosts(r); setDirty(true); }} types={types} cards={cards} />
          </Collapsible>
        )}

        {details && (
          <Collapsible icon={<FileText className="h-4 w-4" />} title="Mais informações" subtitle={details.subtitle} open={infoOpen} onToggle={() => setInfoOpen((o) => !o)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Valor de referência em dinheiro" hint="Quanto este resgate custaria se você pagasse em dinheiro. Serve apenas como referência para calcular o valor obtido por milheiro." className="sm:col-span-2">
                <input className="input" inputMode="decimal" placeholder="R$ 0,00" value={d.cashReference} onChange={(e) => ud({ cashReference: e.target.value })} />
              </Field>
              {has("passengers") && <Field label="Número de passageiros"><input className="input" type="number" min={1} max={99} placeholder="Informar passageiros" value={d.passengers} onChange={(e) => ud({ passengers: e.target.value })} /></Field>}
              {has("reservation") && <Field label="Número da reserva"><input className="input" placeholder="Ex: ABC123" maxLength={40} value={d.reservation} onChange={(e) => ud({ reservation: e.target.value })} /></Field>}
              {has("origin") && <AirportInput label="Origem" value={d.origin} onChange={(v) => ud({ origin: v })} />}
              {has("destination") && <AirportInput label="Destino" value={d.destination} onChange={(v) => ud({ destination: v })} />}
              <Field label="Descrição" className="sm:col-span-2"><input className="input" placeholder="Informar descrição" maxLength={200} value={d.description} onChange={(e) => ud({ description: e.target.value })} /></Field>
              {has("startDate") && <Field label={details.startLabel!}><input className="input" type="date" value={d.startDate} onChange={(e) => ud({ startDate: e.target.value })} /></Field>}
              {has("endDate") && <Field label={details.endLabel!}><input className="input" type="date" value={d.endDate} onChange={(e) => ud({ endDate: e.target.value })} /></Field>}
            </div>
          </Collapsible>
        )}

        {acc && points > 0 && (
          <p className="rounded-xl bg-panel2 px-4 py-3 text-sm text-muted">
            {points > acc.balance ? (
              <span className="text-red-300">Saldo insuficiente: a conta tem {fmtPts(acc.balance)} pts.</span>
            ) : (
              <>Saldo vai para <b className="text-white">{fmtPts(acc.balance - points)}</b> pts. Custo que sai da conta: <b className="text-white">{fmtBRL(Math.round((acc.costCents * points) / Math.max(acc.balance, 1)))}</b>.</>
            )}
            {valueCpm != null && <> Valor obtido: <b className="text-white">{fmtBRL(valueCpm)}</b> por milheiro.</>}
          </p>
        )}
      </form>
    </Modal>
  );
}

/* ============================== Transferência ============================== */

function TransferForm({ accounts, onClose, preset }: { accounts: AccountOpt[]; onClose: () => void; preset?: string }) {
  const router = useRouter();
  const [key] = useState(newKey);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const [dirty, setDirty] = useState(false);
  const [f, setF] = useState({ from: preset ?? "", to: "", points: "", bonus: "", date: today(), description: "" });
  const [adv, setAdv] = useState({ open: false, parityFrom: "1", parityTo: "1", fee: "", cart: false, cartPoints: "", cartPrice: "", applyAll: false, delivery: false, deliveryDate: "" });
  const update = (patch: Partial<typeof f>) => { setF({ ...f, ...patch }); setDirty(true); };
  const ua = (patch: Partial<typeof adv>) => { setAdv({ ...adv, ...patch }); setDirty(true); };
  const [cartPay, setCartPay] = useState<PayState>(emptyPay);

  const src = accounts.find((a) => a.id === f.from);
  const points = parsePts(f.points);
  const pf = Math.max(1, Number(adv.parityFrom) || 1);
  const pt = Math.max(1, Number(adv.parityTo) || 1);
  const base = Math.floor((points * pt) / pf);
  const bonus = Math.floor((base * (Number(f.bonus) || 0)) / 100);
  const fee = parseBRLToCents(adv.fee) ?? 0;
  const cartPts = adv.cart ? parsePts(adv.cartPoints) : 0;
  const cartNominal = adv.cart ? (parseBRLToCents(adv.cartPrice) ?? 0) : 0;
  // compra do carrinho parcelada com antecipação: entra no custo o que de fato foi pago
  const cartCost = planCost(cartNominal, toPlan(cartPay)).effectiveCents;
  // Prévia do custo levado (mesma regra do servidor)
  const srcBalance = (src?.balance ?? 0) + cartPts;
  const srcCost = (src?.costCents ?? 0) + cartCost;
  let carried = 0;
  if (src && points > 0 && points <= srcBalance) {
    if (adv.cart && adv.applyAll && cartPts > 0) {
      const pp = Math.min(cartPts, points);
      const rest = points - pp;
      carried = cartCost + (rest > 0 && srcBalance - pp > 0 ? Math.round(((srcCost - cartCost) * rest) / (srcBalance - pp)) : 0);
    } else carried = Math.round((srcCost * points) / srcBalance);
  }
  const totalCost = carried + fee;

  async function requestClose() {
    if (await confirmDiscard(dirty)) onClose();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!f.from || !f.to) return setErro("Escolha a origem e o destino");
    if (points <= 0) return setErro("Informe os pontos");
    if (adv.fee && parseBRLToCents(adv.fee) === null) return setErro("Taxa inválida");
    if (adv.cart && (cartPts <= 0 || parseBRLToCents(adv.cartPrice) === null)) return setErro("Informe a quantidade e o preço da compra de pontos");
    if (adv.cart && cartPay.installments > 1 && cartPay.anticipate && (toPlan(cartPay).payoffCents == null || (toPlan(cartPay).payoffCents ?? 0) > planCost(cartNominal, toPlan(cartPay)).restCents)) return setErro("Valor para quitar as parcelas inválido");
    if (adv.delivery && !adv.deliveryDate) return setErro("Informe a data de entrega no destino");
    if (adv.delivery && adv.deliveryDate < f.date) return setErro("A data de entrega no destino não pode ser anterior à data da transferência");
    setBusy(true);
    setErro("");
    const r = await api("/api/transfers", "POST", {
      fromAccountId: f.from, toAccountId: f.to, points, bonusPercent: Number(f.bonus) || 0, occurredAt: f.date, description: f.description || null,
      parityFrom: pf, parityTo: pt, feeCents: fee,
      purchase: adv.cart ? { points: cartPts, priceCents: cartCost, applyAll: adv.applyAll, payment: paymentDetail(cartPay, cartNominal) } : null,
      deliveryDate: adv.delivery ? adv.deliveryDate : null,
      idempotencyKey: key,
    });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Transferência registrada");
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal
      open
      onClose={requestClose}
      title="Nova transferência"
      footer={<><button type="button" className="btn-ghost" onClick={requestClose}>Cancelar</button><button form="transfer-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Criar transferência"}</button></>}
    >
      <form id="transfer-form" onSubmit={submit} className="space-y-5">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="De" required><AccountSelect accounts={accounts} value={f.from} onChange={(v) => update({ from: v })} placeholder="Origem" label="De" /></Field>
          <Field label="Para" required><AccountSelect accounts={accounts.filter((a) => a.id !== f.from)} value={f.to} onChange={(v) => update({ to: v })} placeholder="Destino" label="Para" /></Field>
          <Field label="Pontos" required><PointsInput label="Pontos transferidos" value={f.points} onChange={(v) => update({ points: v })} /></Field>
          <Field label="Bônus (%)">
            <div className="relative">
              <input className="input pr-24" inputMode="numeric" placeholder="Ex: 10" value={f.bonus} onChange={(e) => update({ bonus: e.target.value.replace(/\D/g, "").slice(0, 3) })} aria-label="Bônus (%)" />
              <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
                {[10, 50].map((n) => <button key={n} type="button" onClick={() => update({ bonus: String((Number(f.bonus) || 0) + n) })} className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-panel2 hover:text-white">+{n}</button>)}
              </div>
            </div>
          </Field>
          <Field label="Data" required><input className="input" type="date" value={f.date} onChange={(e) => update({ date: e.target.value })} required /></Field>
          <Field label="Descrição"><input className="input" placeholder="Informar descrição" maxLength={200} value={f.description} onChange={(e) => update({ description: e.target.value })} /></Field>
        </div>

        <Collapsible icon={<Settings2 className="h-4 w-4" />} title="Configurações avançadas" subtitle="Paridade, taxas e compra de pontos" open={adv.open} onToggle={() => setAdv({ ...adv, open: !adv.open })}>
          <div className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Paridade" hint="Quantos pontos de origem viram quantos no destino">
                <div className="flex items-center gap-2">
                  <input className="input text-center" type="number" min={1} max={1000} value={adv.parityFrom} onChange={(e) => ua({ parityFrom: e.target.value })} aria-label="Pontos de origem" />
                  <span className="text-muted">:</span>
                  <input className="input text-center" type="number" min={1} max={1000} value={adv.parityTo} onChange={(e) => ua({ parityTo: e.target.value })} aria-label="Pontos no destino" />
                </div>
              </Field>
              <Field label="Taxas adicionais (R$)"><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={adv.fee} onChange={(e) => ua({ fee: e.target.value })} /></Field>
            </div>
            <div className="space-y-3 rounded-xl bg-panel2/60 p-3">
              <Switch checked={adv.cart} onChange={(v) => ua({ cart: v })} label="Compra de pontos no carrinho" hint="Comprar pontos antes de transferir" />
              {adv.cart && (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Quantidade" required><input className="input tabular-nums" inputMode="numeric" placeholder="Ex: 8000" value={adv.cartPoints} onChange={(e) => ua({ cartPoints: e.target.value ? fmtPts(parsePts(e.target.value)) : "" })} /></Field>
                    <Field label="Preço da compra (R$)" required><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={adv.cartPrice} onChange={(e) => ua({ cartPrice: e.target.value })} /></Field>
                  </div>
                  {cartNominal > 0 && <PaymentFields label="Pagamento da compra" totalCents={cartNominal} value={cartPay} onChange={(p) => { setCartPay(p); setDirty(true); }} />}
                  <Switch checked={adv.applyAll} onChange={(v) => ua({ applyAll: v })} label="Aplicar todos os pontos comprados na transferência" hint="Prioriza os pontos comprados, em vez de usar o custo médio da conta" />
                </>
              )}
            </div>
            <div className="space-y-3 rounded-xl bg-panel2/60 p-3">
              <Switch checked={adv.delivery} onChange={(v) => ua({ delivery: v })} label="Previsão de entrega diferente" hint="Defina quando os pontos chegarão no programa de destino" />
              {adv.delivery && <Field label="Data de entrega no destino" required><input className="input" type="date" value={adv.deliveryDate} min={f.date} onChange={(e) => ua({ deliveryDate: e.target.value })} /></Field>}
            </div>
          </div>
        </Collapsible>

        {src && points > 0 && (
          <div className="grid grid-cols-2 gap-3 rounded-xl bg-panel2 p-4 text-sm sm:grid-cols-4">
            <div><p className="text-xs text-muted">Chegam</p><p className="font-semibold tabular-nums">{fmtPts(base + bonus)} pts</p></div>
            <div><p className="text-xs text-muted">Bônus</p><p className="font-semibold tabular-nums">{fmtPts(bonus)} pts</p></div>
            <div><p className="text-xs text-muted">Custo levado</p><p className="font-semibold tabular-nums">{fmtBRL(totalCost)}</p></div>
            <div><p className="text-xs text-muted">CPM no destino</p><p className="font-semibold tabular-nums text-accent-light">{fmtBRL(cpm(totalCost, base + bonus))}</p></div>
            {points > srcBalance && <p className="col-span-full text-red-300">Saldo insuficiente na origem ({fmtPts(srcBalance)} pts{cartPts ? " já contando a compra" : ""}).</p>}
            {adv.delivery && adv.deliveryDate && <p className="col-span-full text-xs text-muted">Os pontos ficam “a receber” no destino até {adv.deliveryDate.split("-").reverse().join("/")}.</p>}
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ============================== Lote ============================== */

type Row = { op: "credit" | "debit"; type: EntryType | ""; points: string; cost: string; date: string; description: string };
const emptyRow = (): Row => ({ op: "credit", type: "", points: "", cost: "", date: today(), description: "" });

function BatchForm({ accounts, onClose }: { accounts: AccountOpt[]; onClose: () => void }) {
  const router = useRouter();
  const [key] = useState(newKey);
  const [account, setAccount] = useState<AccountOpt | null>(null);
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.type || r.points);
  const dirty = filled.length > 0;
  const sorted = useMemo(() => [...accounts].sort((a, b) => accountLabel(a).localeCompare(accountLabel(b))), [accounts]);

  async function requestClose() {
    if (await confirmDiscard(dirty)) onClose();
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;
    if (filled.length === 0) return setErro("Preencha ao menos um registro");
    const items = [];
    for (const [i, r] of filled.entries()) {
      const pts = parsePts(r.points);
      if (!r.type || pts <= 0) return setErro(`Registro ${i + 1}: preencha tipo e pontos`);
      const c = r.op === "credit" && r.cost ? parseBRLToCents(r.cost) : 0;
      if (c === null) return setErro(`Registro ${i + 1}: custo inválido`);
      items.push({ accountId: account.id, type: r.type, points: pts, costCents: r.op === "credit" ? c : undefined, occurredAt: r.date, description: r.description || undefined });
    }
    setBusy(true);
    setErro("");
    const res = await api<{ created: number }>("/api/entries/batch", "POST", { items, idempotencyKey: key });
    setBusy(false);
    if (!res.ok) return setErro(res.erro);
    toast(`${items.length} ${items.length === 1 ? "registro criado" : "registros criados"}`);
    onClose();
    refreshSafe(router);
  }

  if (!account) {
    return (
      <Modal open onClose={onClose} title="Selecionar programa" size="sm" footer={<button className="btn-ghost" onClick={onClose}>Cancelar</button>}>
        <p className="mb-3 text-sm text-muted">Selecione o programa para adicionar registros em lote</p>
        <ul className="space-y-1" role="listbox" aria-label="Programa do lote">
          {sorted.map((a) => {
            const c = a.balance > 0 && a.costCents > 0 ? fmtBRL(cpm(a.costCents, a.balance)) : "Orgânico";
            return (
              <li key={a.id}>
                <button type="button" role="option" aria-selected={false} onClick={() => setAccount(a)} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-panel2">
                  <ProgramLogo programId={a.programId ?? a.id} name={a.program} color={a.color} version={a.logo} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{accountLabel(a)}</span>
                    <span className="block text-xs text-muted">{fmtPts(a.balance)} · {c}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={requestClose}
      size="lg"
      title={`Registros em lote para ${accountLabel(account)}`}
      footer={<><button type="button" className="btn-ghost mr-auto" onClick={() => setAccount(null)}><ChevronLeft className="h-4 w-4" />Trocar programa</button><button type="button" className="btn-ghost" onClick={requestClose}>Cancelar</button><button form="batch-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Criar registros"}</button></>}
    >
      <form id="batch-form" onSubmit={submit} className="space-y-3">
        <p className="text-sm text-muted">Adicione vários registros de uma vez. Tudo é gravado junto: se um registro tiver erro, nenhum é salvo.</p>
        {erro && <Alert>{erro}</Alert>}
        <div className="hidden grid-cols-[.9fr_1.3fr_.9fr_.8fr_1fr_1.2fr_auto] gap-2 text-xs font-medium text-muted lg:grid">
          <span>Operação *</span><span>Tipo *</span><span>Pontos *</span><span>Custo</span><span>Data *</span><span>Descrição</span><span className="w-9" />
        </div>
        {rows.map((r, i) => {
          const list = (r.op === "credit" ? MANUAL_CREDIT_TYPES : MANUAL_DEBIT_TYPES) as readonly EntryType[];
          return (
            <div key={i} className="grid grid-cols-2 gap-2 rounded-xl border border-line p-3 lg:grid-cols-[.9fr_1.3fr_.9fr_.8fr_1fr_1.2fr_auto] lg:items-center lg:border-0 lg:p-0" data-batch-row>
              <select className="input" value={r.op} onChange={(e) => set(i, { op: e.target.value as Row["op"], type: "", cost: "" })} aria-label={`Operação do registro ${i + 1}`}>
                <option value="credit">Crédito</option>
                <option value="debit">Débito</option>
              </select>
              <select className="input" value={r.type} onChange={(e) => set(i, { type: e.target.value as EntryType })} aria-label={`Tipo do registro ${i + 1}`}>
                <option value="" disabled>Selecione</option>
                {list.map((t) => <option key={t} value={t}>{ENTRY_LABELS[t]}</option>)}
              </select>
              <input className="input tabular-nums" inputMode="numeric" placeholder="Ex: 1000" value={r.points} onChange={(e) => set(i, { points: e.target.value ? fmtPts(parsePts(e.target.value)) : "" })} aria-label={`Pontos do registro ${i + 1}`} />
              <input className="input" inputMode="decimal" placeholder={r.op === "credit" ? "0,00" : "—"} disabled={r.op !== "credit"} value={r.op === "credit" ? r.cost : ""} onChange={(e) => set(i, { cost: e.target.value })} aria-label={`Custo do registro ${i + 1}`} />
              <input className="input" type="date" value={r.date} onChange={(e) => set(i, { date: e.target.value })} aria-label={`Data do registro ${i + 1}`} />
              <input className="input" placeholder="Informar descrição" value={r.description} maxLength={200} onChange={(e) => set(i, { description: e.target.value })} aria-label={`Descrição do registro ${i + 1}`} />
              <button type="button" className="btn-subtle h-10 w-10 px-0" onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [emptyRow()]))} aria-label={`Limpar registro ${i + 1}`}><Trash2 className="h-4 w-4" /></button>
            </div>
          );
        })}
        <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-light hover:underline" onClick={() => setRows((rs) => [...rs, emptyRow()])} disabled={rows.length >= 200}><Plus className="h-4 w-4" />Adicionar registro</button>
      </form>
    </Modal>
  );
}
