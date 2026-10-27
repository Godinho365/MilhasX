"use client";
// Os 8 simuladores: formulário, botão "Simular" (mostra o resultado e salva em Recentes) e o resultado.
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { Calculator, Settings2, Receipt, Trophy, AlertTriangle, Eraser } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import {
  simulateBonusPurchase, simulateStoreComparison, simulateBuyPoints, simulateTransfer, simulateFlight, simulateHotel,
  simulateSale, rankSuppliers, simulationTitle, KIND_LABELS, type SimulatorKind,
} from "@/domain/simulators";
import { Field, Alert } from "@/components/ui";
import { Collapsible, Switch, PointsInput, parsePts } from "@/components/form-parts";
import { toast } from "@/components/feedback";

export type SimAccount = { id: string; label: string; programId: string; program: string; balance: number; costCents: number; marketCpm: number };
export type SimSupplier = { id: string; supplier: string; identifier: string | null; programId: string; program: string; balance: number; priceCpmCents: number; cpfAvailable: number | null };
type Values = Record<string, string | boolean>;


const DEFAULTS: Record<SimulatorKind, Values> = {
  bonificada: { accountId: "", ppr: "", value: "", extra: "" },
  "store-comparison": { accountId: "", milheiro: "", pointsPrice: "", ppr: "", cashbackPrice: "", cashbackPct: "" },
  pontos: { accountId: "", points: "", cost: "" },
  transfer: { from: "", to: "", points: "", bonus: "0", parityFrom: "1", parityTo: "1", fee: "", cart: false, cartPoints: "", cartPrice: "", applyAll: false },
  flight: { accountId: "", outbound: "", ret: "", taxes: "" },
  hotel: { accountId: "", points: "", discount: "", taxes: "" },
  sale: { origin: "own", accountId: "", supplierAccountId: "", outbound: "", ret: "", saleValue: "", extra: "" },
  "supplier-ranking": { programId: "", points: "", cpfCount: "1" },
};

const money = (v: string | boolean | undefined) => (typeof v === "string" && v ? parseBRLToCents(v) : 0);
const num = (v: string | boolean | undefined) => (typeof v === "string" ? Number(v.replace(",", ".")) || 0 : 0);
const pts = (v: string | boolean | undefined) => (typeof v === "string" ? parsePts(v) : 0);
const brl = (c: number | null | undefined) => (c == null ? "-" : fmtBRL(c));

export function SimulatorView({ kind, accounts, suppliers, initial, simId }: { kind: SimulatorKind; accounts: SimAccount[]; suppliers: SimSupplier[]; initial?: Values | null; simId?: string | null }) {
  const router = useRouter();
  const [v, setV] = useState<Values>({ ...DEFAULTS[kind], ...(initial ?? {}) });
  const [shown, setShown] = useState<Values | null>(initial ? { ...DEFAULTS[kind], ...initial } : null);
  const [advanced, setAdvanced] = useState(!!(initial && (initial.cart || initial.fee || initial.parityFrom !== "1" || initial.parityTo !== "1")));
  const [extraOpen, setExtraOpen] = useState(!!(initial && initial.extra));
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const run = () => formRef.current?.requestSubmit();
    window.addEventListener("mm:simulate", run);
    return () => window.removeEventListener("mm:simulate", run);
  }, []);
  const set = (patch: Values) => { setV({ ...v, ...patch }); setErro(""); };
  const acc = (id: string | boolean | undefined) => accounts.find((a) => a.id === id);
  const state = (a?: SimAccount) => (a ? { balance: a.balance, costCents: a.costCents } : undefined);

  /** Campos obrigatórios de cada simulador (como os asteriscos da referência). */
  function missing(): string | null {
    const need = (ok: boolean, msg: string) => (ok ? null : msg);
    switch (kind) {
      case "bonificada": return need(!!v.accountId, "Selecione o programa") ?? need(num(v.ppr) > 0, "Informe os pontos por real") ?? need((money(v.value) ?? 0) > 0, "Informe o valor da compra");
      case "store-comparison": return need(!!v.accountId, "Selecione o programa") ?? need((money(v.pointsPrice) ?? 0) > 0 || (money(v.cashbackPrice) ?? 0) > 0, "Informe o preço das lojas");
      case "pontos": return need(!!v.accountId, "Selecione o programa") ?? need(pts(v.points) > 0, "Informe os pontos") ?? need((money(v.cost) ?? 0) > 0, "Informe o custo");
      case "transfer": return need(!!v.from && !!v.to, "Selecione a origem e o destino") ?? need(v.from !== v.to, "Origem e destino precisam ser diferentes") ?? need(pts(v.points) > 0, "Informe os pontos");
      case "flight": return need(!!v.accountId, "Selecione o programa") ?? need(pts(v.outbound) > 0, "Informe os pontos da ida");
      case "hotel": return need(!!v.accountId, "Selecione o programa") ?? need(pts(v.points) > 0, "Informe os pontos da reserva");
      case "sale": return need(v.origin === "own" ? !!v.accountId : !!v.supplierAccountId, v.origin === "own" ? "Selecione o programa" : "Selecione a conta do fornecedor") ?? need(pts(v.outbound) > 0, "Informe os pontos da ida") ?? need((money(v.saleValue) ?? 0) > 0, "Informe o valor dos pontos");
      case "supplier-ranking": return need(!!v.programId, "Selecione o programa") ?? need(pts(v.points) > 0, "Informe os pontos da emissão") ?? need(pts(v.cpfCount) > 0, "Informe o número de CPFs");
    }
  }
  function title() {
    const a = acc(v.accountId);
    switch (kind) {
      case "transfer": return simulationTitle({ from: acc(v.from)?.program, to: acc(v.to)?.program, points: pts(v.points) });
      case "bonificada": return simulationTitle({ label: `${KIND_LABELS[kind]} · ${a?.program ?? ""}`, points: Math.floor(((money(v.value) ?? 0) / 100) * num(v.ppr)) });
      case "flight": return simulationTitle({ label: `Passagem · ${a?.program ?? ""}`, points: pts(v.outbound) + pts(v.ret) });
      case "sale": return simulationTitle({ label: `Venda · ${v.origin === "own" ? (a?.program ?? "") : (suppliers.find((s) => s.id === v.supplierAccountId)?.supplier ?? "")}`, points: pts(v.outbound) + pts(v.ret) });
      case "supplier-ranking": return simulationTitle({ label: `Fornecedor · ${suppliers.find((s) => s.programId === v.programId)?.program ?? ""}`, points: pts(v.points) });
      default: return simulationTitle({ label: `${KIND_LABELS[kind]} · ${a?.program ?? ""}`, points: pts(v.points) || undefined });
    }
  }
  async function simulate(e: React.FormEvent) {
    e.preventDefault();
    const m = missing();
    if (m) return setErro(m);
    for (const k of ["value", "extra", "pointsPrice", "cashbackPrice", "milheiro", "cost", "fee", "cartPrice", "taxes", "saleValue"]) {
      if (typeof v[k] === "string" && v[k] && money(v[k]) === null) return setErro("Valor em reais inválido");
    }
    setShown({ ...v });
    setBusy(true);
    const r = await api<{ item: { id: string } }>("/api/simulations", "POST", { kind, title: title(), input: v });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    // Só atualiza a lista "Recentes"; o formulário e o resultado continuam na tela
    refreshSafe(router);
  }
  function clear() {
    setV({ ...DEFAULTS[kind] });
    setShown(null);
    setErro("");
    if (simId) router.replace("?", { scroll: false });
  }

  const accountField = (key: string, label = "Programa") => (
    <Field label={label} required>
      <select className="input" value={String(v[key] ?? "")} onChange={(e) => set({ [key]: e.target.value })} aria-label={label}>
        <option value="" disabled>{accounts.length ? "Selecione o programa" : "Cadastre uma conta em Programas"}</option>
        {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
    </Field>
  );
  const moneyField = (key: string, label: string, opts: { required?: boolean; hint?: string; placeholder?: string } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint}>
      <input className="input" inputMode="decimal" placeholder={opts.placeholder ?? "R$ 0,00"} value={String(v[key] ?? "")} onChange={(e) => set({ [key]: e.target.value })} aria-label={label} />
    </Field>
  );
  const pointsField = (key: string, label: string, opts: { required?: boolean; big?: boolean; placeholder?: string } = {}) => (
    <Field label={label} required={opts.required}>
      <PointsInput
        label={label}
        value={String(v[key] ?? "")}
        onChange={(x) => set({ [key]: x })}
        placeholder={opts.placeholder ?? "0"}
        quick={opts.big ? [[1000, "+1k"], [10000, "+10k"], [100000, "+100k"]] : undefined}
      />
    </Field>
  );
  const numField = (key: string, label: string, opts: { required?: boolean; placeholder?: string; hint?: string } = {}) => (
    <Field label={label} required={opts.required} hint={opts.hint}>
      <input className="input" inputMode="decimal" placeholder={opts.placeholder} value={String(v[key] ?? "")} onChange={(e) => set({ [key]: e.target.value })} aria-label={label} />
    </Field>
  );

  let form: React.ReactNode = null;
  switch (kind) {
    case "bonificada": {
      const expected = Math.floor(((money(v.value) ?? 0) / 100) * num(v.ppr));
      form = (
        <>
          {accountField("accountId")}
          <div className="grid gap-4 sm:grid-cols-2">
            {numField("ppr", "Pontos por Real", { required: true, placeholder: "Ex: 1.5" })}
            {moneyField("value", "Valor da Compra", { required: true })}
          </div>
          {expected > 0 && <p className="text-sm text-muted">ℹ Pontos esperados: <b className="text-white">{fmtPts(expected)} pontos</b></p>}
          <Collapsible icon={<Receipt className="h-4 w-4" />} title="Custo extra" subtitle="Frete, markup ou diferença de preço" open={extraOpen} onToggle={() => setExtraOpen(!extraOpen)}>
            {moneyField("extra", "Custo extra (R$)")}
          </Collapsible>
        </>
      );
      break;
    }
    case "store-comparison": {
      const a = acc(v.accountId);
      form = (
        <>
          {accountField("accountId")}
          {moneyField("milheiro", "Valor do milheiro", { placeholder: "Sem valor", hint: a ? `Em branco, usa o valor de mercado do programa (${fmtBRL(a.marketCpm)}).` : "Quanto vale cada mil pontos para você." })}
          <div className="grid gap-4 sm:grid-cols-2">
            <section className="space-y-3 rounded-xl border border-line p-3">
              <p className="text-sm font-semibold">Loja com pontos</p>
              {moneyField("pointsPrice", "Preço na loja")}
              {numField("ppr", "Pontos por real", { placeholder: "Ex: 5" })}
            </section>
            <section className="space-y-3 rounded-xl border border-line p-3">
              <p className="text-sm font-semibold">Loja com cashback</p>
              {moneyField("cashbackPrice", "Preço na loja ")}
              {numField("cashbackPct", "Cashback (%)", { placeholder: "Ex: 10" })}
            </section>
          </div>
        </>
      );
      break;
    }
    case "pontos":
      form = (
        <>
          {accountField("accountId")}
          <div className="grid gap-4 sm:grid-cols-2">
            {pointsField("points", "Pontos a comprar", { required: true, placeholder: "Ex: 10000" })}
            {moneyField("cost", "Custo (R$)", { required: true })}
          </div>
        </>
      );
      break;
    case "transfer":
      form = (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            {accountField("from", "Programa de origem")}
            {accountField("to", "Programa de destino")}
            {pointsField("points", "Pontos a transferir", { required: true, placeholder: "Ex: 1000" })}
            <Field label="Percentual de Bônus">
              <div className="relative">
                <input className="input pr-24" inputMode="numeric" placeholder="Ex: 50" value={String(v.bonus)} onChange={(e) => set({ bonus: e.target.value.replace(/\D/g, "").slice(0, 3) })} aria-label="Percentual de Bônus" />
                <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 gap-0.5">
                  {[10, 50].map((n) => <button key={n} type="button" onClick={() => set({ bonus: String(num(v.bonus) + n) })} className="rounded-md px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-panel2 hover:text-white">+{n}</button>)}
                </div>
              </div>
            </Field>
          </div>
          <Collapsible icon={<Settings2 className="h-4 w-4" />} title="Configurações avançadas" subtitle="Paridade, taxas e compra de pontos" open={advanced} onToggle={() => setAdvanced(!advanced)}>
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Paridade">
                  <div className="flex items-center gap-2">
                    <input className="input text-center" type="number" min={1} value={String(v.parityFrom)} onChange={(e) => set({ parityFrom: e.target.value })} aria-label="Pontos de origem" />
                    <span className="text-muted">:</span>
                    <input className="input text-center" type="number" min={1} value={String(v.parityTo)} onChange={(e) => set({ parityTo: e.target.value })} aria-label="Pontos no destino" />
                  </div>
                </Field>
                {moneyField("fee", "Taxas adicionais (R$)")}
              </div>
              <div className="space-y-3 rounded-xl bg-panel2/60 p-3">
                <Switch checked={!!v.cart} onChange={(x) => set({ cart: x })} label="Compra de pontos no carrinho" hint="Comprar pontos antes de transferir" />
                {v.cart && (
                  <>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {pointsField("cartPoints", "Quantidade")}
                      {moneyField("cartPrice", "Preço da compra (R$)")}
                    </div>
                    <Switch checked={!!v.applyAll} onChange={(x) => set({ applyAll: x })} label="Aplicar todos os pontos comprados na transferência" hint="Prioriza os pontos comprados, em vez de usar o custo médio da conta" />
                  </>
                )}
              </div>
            </div>
          </Collapsible>
        </>
      );
      break;
    case "flight":
      form = (
        <>
          {accountField("accountId")}
          <div className="grid gap-4 sm:grid-cols-2">
            {pointsField("outbound", "Pontos (Ida)", { required: true, placeholder: "Ex: 15000" })}
            {pointsField("ret", "Pontos (Volta)", { placeholder: "Opcional" })}
          </div>
          {moneyField("taxes", "Total de Taxas (R$)")}
        </>
      );
      break;
    case "hotel":
      form = (
        <>
          {accountField("accountId")}
          {pointsField("points", "Pontos da Reserva", { required: true, placeholder: "Ex: 60000" })}
          <div className="grid gap-4 sm:grid-cols-2">
            {numField("discount", "Desconto (%)", { placeholder: "0%" })}
            {moneyField("taxes", "Taxas (R$)")}
          </div>
        </>
      );
      break;
    case "sale":
      form = (
        <>
          <div>
            <span className="label">Origem dos pontos</span>
            <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Origem dos pontos">
              {[["own", "Meus pontos"], ["supplier", "Fornecedor"]].map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={v.origin === k} onClick={() => set({ origin: k! })} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${v.origin === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{l}</button>
              ))}
            </div>
          </div>
          {v.origin === "own" ? accountField("accountId") : (
            <Field label="Programa" required>
              <select className="input" value={String(v.supplierAccountId)} onChange={(e) => set({ supplierAccountId: e.target.value })} aria-label="Conta do fornecedor">
                <option value="" disabled>{suppliers.length ? "Selecione a conta do fornecedor" : "Nenhuma conta de fornecedor"}</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.program} · {s.supplier}{s.identifier ? ` (${s.identifier})` : ""} · {fmtBRL(s.priceCpmCents)}/milheiro</option>)}
              </select>
            </Field>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {pointsField("outbound", "Pontos (Ida)", { required: true, big: true, placeholder: "Ex: 15000" })}
            {pointsField("ret", "Pontos (Volta)", { big: true, placeholder: "Opcional" })}
          </div>
          {moneyField("saleValue", "Valor dos Pontos (R$)", { required: true, hint: "Quanto o cliente paga pelos pontos" })}
          <Collapsible icon={<Receipt className="h-4 w-4" />} title="Custos adicionais" subtitle="Taxas e outros valores repassados nesta venda" open={extraOpen} onToggle={() => setExtraOpen(!extraOpen)}>
            {moneyField("extra", "Custos adicionais (R$)")}
          </Collapsible>
        </>
      );
      break;
    case "supplier-ranking": {
      const programs = [...new Map(suppliers.map((s) => [s.programId, s.program])).entries()];
      form = (
        <>
          <Field label="Programa" required>
            <select className="input" value={String(v.programId)} onChange={(e) => set({ programId: e.target.value })} aria-label="Programa">
              <option value="" disabled>{programs.length ? "Selecione o programa" : "Nenhuma conta de fornecedor"}</option>
              {programs.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {pointsField("points", "Pontos da emissão", { required: true, big: true, placeholder: "Ex: 30000" })}
            {numField("cpfCount", "Número de CPFs (passageiros)", { required: true, placeholder: "Ex: 2" })}
          </div>
        </>
      );
      break;
    }
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form ref={formRef} onSubmit={simulate} className="card card-pad space-y-4" aria-label={KIND_LABELS[kind]}>
        {erro && <Alert>{erro}</Alert>}
        {form}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <button type="button" className="btn-ghost" onClick={clear}><Eraser className="h-4 w-4" />Limpar</button>
          <button className="btn-primary" disabled={busy}><Calculator className="h-4 w-4" />Simular</button>
        </div>
      </form>
      <section className="card card-pad" aria-label="Resultado da simulação" aria-live="polite">
        <h2 className="mb-1 text-lg font-semibold">Resultado</h2>
        {shown ? <ResultView kind={kind} v={shown} accounts={accounts} suppliers={suppliers} /> : <p className="py-10 text-center text-sm text-muted">Preencha os campos e clique em <b>Simular</b>.</p>}
      </section>
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; value: React.ReactNode; strong?: boolean; tone?: "ok" | "bad" | "accent" }[] }) {
  return (
    <dl className="divide-y divide-line">
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="text-sm text-muted">{r.label}</dt>
          <dd className={`tabular-nums ${r.strong ? "text-xl font-semibold" : "font-medium"} ${r.tone === "ok" ? "text-ok" : r.tone === "bad" ? "text-bad" : r.tone === "accent" ? "text-accent-light" : ""}`}>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}
const Warn = ({ children }: { children: React.ReactNode }) => <p className="mt-3 flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300"><AlertTriangle className="h-4 w-4 shrink-0" />{children}</p>;

function ResultView({ kind, v, accounts, suppliers }: { kind: SimulatorKind; v: Values; accounts: SimAccount[]; suppliers: SimSupplier[] }) {
  const acc = (id: string | boolean | undefined) => accounts.find((a) => a.id === id);
  const st = (a?: SimAccount) => ({ balance: a?.balance ?? 0, costCents: a?.costCents ?? 0 });
  switch (kind) {
    case "bonificada": {
      const a = acc(v.accountId);
      const r = simulateBonusPurchase({ valueCents: money(v.value) ?? 0, pointsPerReal: num(v.ppr), extraCostCents: money(v.extra) ?? 0, account: a && st(a) });
      return (
        <Rows rows={[
          { label: "Pontos ganhos", value: `${fmtPts(r.points)} pts`, strong: true },
          { label: "Valor total pago", value: brl(r.totalCostCents) },
          { label: "CPM dos pontos (custo extra)", value: brl(r.cpmExtraCents), tone: "accent" },
          { label: "CPM considerando o valor total", value: brl(r.cpmTotalCents) },
          { label: `CPM da conta ${a?.label ?? ""}`, value: <>{brl(r.accountCpmBefore)} → <b>{brl(r.accountCpmAfter)}</b></> },
        ]} />
      );
    }
    case "store-comparison": {
      const a = acc(v.accountId);
      const milheiro = v.milheiro ? (money(v.milheiro) ?? 0) : (a?.marketCpm ?? 0);
      const r = simulateStoreComparison({ milheiroCents: milheiro, pointsPriceCents: money(v.pointsPrice) ?? 0, pointsPerReal: num(v.ppr), cashbackPriceCents: money(v.cashbackPrice) ?? 0, cashbackPercent: num(v.cashbackPct) });
      return (
        <>
          <p className={`my-3 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${r.winner === "tie" ? "bg-panel2" : "bg-green-500/10 text-green-300"}`}>
            <Trophy className="h-4 w-4" />
            {r.winner === "tie" ? "As duas opções saem pelo mesmo custo" : `${r.winner === "points" ? "Loja com pontos" : "Loja com cashback"} sai ${fmtBRL(r.savingCents)} mais barato`}
          </p>
          <Rows rows={[
            { label: "Valor do milheiro usado", value: brl(milheiro) },
            { label: "Pontos ganhos", value: `${fmtPts(r.points)} pts` },
            { label: "Valor dos pontos", value: brl(r.pointsValueCents) },
            { label: "Custo efetivo com pontos", value: brl(r.pointsEffectiveCents), tone: r.winner === "points" ? "ok" : undefined },
            { label: "Cashback", value: brl(r.cashbackCents) },
            { label: "Custo efetivo com cashback", value: brl(r.cashbackEffectiveCents), tone: r.winner === "cashback" ? "ok" : undefined },
            { label: "Empate quando o milheiro vale", value: brl(r.breakEvenCpmCents) },
          ]} />
        </>
      );
    }
    case "pontos": {
      const a = acc(v.accountId);
      const r = simulateBuyPoints({ points: pts(v.points), costCents: money(v.cost) ?? 0, account: a && st(a), marketCpmCents: a?.marketCpm });
      return (
        <Rows rows={[
          { label: "CPM da compra", value: brl(r.purchaseCpmCents), strong: true, tone: "accent" },
          { label: `CPM da conta ${a?.label ?? ""}`, value: <>{brl(r.accountCpmBefore)} → <b>{brl(r.accountCpmAfter)}</b></> },
          { label: "Saldo depois da compra", value: `${fmtPts(r.newBalance)} pts` },
          ...(r.vsMarketCents != null ? [{ label: "Em relação ao valor de mercado", value: r.vsMarketCents >= 0 ? `${fmtBRL(r.vsMarketCents)} abaixo` : `${fmtBRL(-r.vsMarketCents)} acima`, tone: (r.vsMarketCents >= 0 ? "ok" : "bad") as "ok" | "bad" }] : []),
        ]} />
      );
    }
    case "transfer": {
      const from = acc(v.from);
      const to = acc(v.to);
      const r = simulateTransfer({
        points: pts(v.points), bonusPercent: num(v.bonus), parityFrom: num(v.parityFrom) || 1, parityTo: num(v.parityTo) || 1, feeCents: money(v.fee) ?? 0,
        source: st(from), destination: st(to),
        purchase: v.cart ? { points: pts(v.cartPoints), priceCents: money(v.cartPrice) ?? 0, applyAll: !!v.applyAll } : null,
      });
      return (
        <>
          <Rows rows={[
            { label: `Chegam em ${to?.program ?? "destino"}`, value: `${fmtPts(r.totalPoints)} pts`, strong: true },
            { label: "Bônus", value: `${fmtPts(r.bonusPoints)} pts` },
            { label: "CPM da origem", value: brl(r.sourceCpmCents) },
            { label: "Custo levado", value: brl(r.costCents) },
            { label: "CPM no destino", value: brl(r.destCpmCents), tone: "accent" },
            { label: `CPM da conta ${to?.label ?? ""} depois`, value: brl(r.destAccountCpmAfter) },
            { label: `Saldo da origem depois`, value: `${fmtPts(Math.max(r.sourceBalanceAfter, 0))} pts` },
          ]} />
          {!r.enough && <Warn>Saldo insuficiente na origem ({fmtPts(st(from).balance + (v.cart ? pts(v.cartPoints) : 0))} pts).</Warn>}
        </>
      );
    }
    case "flight": {
      const a = acc(v.accountId);
      const r = simulateFlight({ outboundPoints: pts(v.outbound), returnPoints: pts(v.ret), taxesCents: money(v.taxes) ?? 0, account: st(a) });
      return (
        <>
          <Rows rows={[
            { label: "Custo total da passagem", value: brl(r.totalCostCents), strong: true, tone: "accent" },
            { label: "Pontos (ida + volta)", value: `${fmtPts(r.points)} pts` },
            { label: "CPM da conta", value: brl(r.accountCpmCents) },
            { label: "Custo dos pontos", value: brl(r.pointsCostCents) },
            { label: "Taxas", value: brl(money(v.taxes)) },
            { label: "Saldo depois", value: `${fmtPts(Math.max(r.balanceAfter, 0))} pts` },
          ]} />
          {!r.enough && <Warn>Saldo insuficiente: a conta tem {fmtPts(st(a).balance)} pts.</Warn>}
        </>
      );
    }
    case "hotel": {
      const a = acc(v.accountId);
      const r = simulateHotel({ points: pts(v.points), discountPercent: num(v.discount), taxesCents: money(v.taxes) ?? 0, account: st(a) });
      return (
        <>
          <Rows rows={[
            { label: "Custo total da hospedagem", value: brl(r.totalCostCents), strong: true, tone: "accent" },
            { label: "Pontos com desconto", value: `${fmtPts(r.points)} pts` },
            { label: "Pontos economizados", value: `${fmtPts(r.savedPoints)} pts`, tone: r.savedPoints ? "ok" : undefined },
            { label: "Custo dos pontos", value: brl(r.pointsCostCents) },
            { label: "Taxas", value: brl(money(v.taxes)) },
            { label: "Saldo depois", value: `${fmtPts(Math.max(r.balanceAfter, 0))} pts` },
          ]} />
          {!r.enough && <Warn>Saldo insuficiente: a conta tem {fmtPts(st(a).balance)} pts.</Warn>}
        </>
      );
    }
    case "sale": {
      const own = v.origin === "own";
      const a = acc(v.accountId);
      const s = suppliers.find((x) => x.id === v.supplierAccountId);
      const costCpm = own ? (a && a.balance > 0 ? Math.round((a.costCents * 1000) / a.balance) : 0) : (s?.priceCpmCents ?? 0);
      const points = pts(v.outbound) + pts(v.ret);
      const r = simulateSale({ points, saleCents: money(v.saleValue) ?? 0, extraCostsCents: money(v.extra) ?? 0, costCpmCents: costCpm });
      const available = own ? (a?.balance ?? 0) : (s?.balance ?? 0);
      return (
        <>
          <Rows rows={[
            { label: "Lucro", value: brl(r.profitCents), strong: true, tone: r.profitCents >= 0 ? "ok" : "bad" },
            { label: "Margem", value: r.marginPct != null ? `${r.marginPct.toLocaleString("pt-BR")}%` : "-" },
            { label: "Pontos vendidos", value: `${fmtPts(points)} pts` },
            { label: "Preço por milheiro", value: brl(r.saleCpmCents) },
            { label: own ? "CPM da conta" : "Preço do fornecedor", value: brl(costCpm) },
            { label: "Custo dos pontos", value: brl(r.pointsCostCents) },
            { label: "Custos adicionais", value: brl(money(v.extra)) },
          ]} />
          {points > available && <Warn>Saldo insuficiente: {own ? "a conta" : "o fornecedor"} tem {fmtPts(available)} pts.</Warn>}
        </>
      );
    }
    case "supplier-ranking": {
      const options = suppliers.filter((s) => s.programId === v.programId);
      const r = rankSuppliers(options, pts(v.points), pts(v.cpfCount));
      if (r.length === 0) return <p className="py-8 text-center text-sm text-muted">Nenhuma conta de fornecedor nesse programa.</p>;
      return (
        <ol className="mt-2 space-y-2">
          {r.map((x, i) => (
            <li key={x.id} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${x.eligible ? (i === 0 ? "border-green-500/40 bg-green-500/10" : "border-line") : "border-line opacity-60"}`}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-panel2 text-xs font-bold">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{x.supplier}{x.identifier ? ` · ${x.identifier}` : ""}</p>
                <p className="text-xs text-muted">{fmtPts(x.balance)} pts · {fmtBRL(x.priceCpmCents)}/milheiro · CPFs: {x.cpfAvailable ?? "não informado"}</p>
                {!x.eligible && <p className="text-xs text-amber-300">{x.reasons.join(" · ")}</p>}
              </div>
              <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{fmtBRL(x.costCents)}</span>
            </li>
          ))}
        </ol>
      );
    }
  }
}
