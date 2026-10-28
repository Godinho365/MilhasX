"use client";
// As 7 calculadoras rápidas: cada uma num cartão que abre e fecha, com filtro por categoria e busca.
import { useEffect, useMemo, useState } from "react";
import { Scale, Route as RouteIcon, CalendarClock, ArrowLeftRight, Coins, Gauge, ShoppingCart, ChevronDown, ChevronUp, Search, Plus, X, Copy, Trophy, ArrowRight } from "lucide-react";
import { fmtBRL, fmtPts, parseBRLToCents } from "@/lib/format";
import { parsePts } from "@/components/form-parts";
import { Modal } from "@/components/ui";
import { toast } from "@/components/feedback";
import {
  usdToBrlCents, quoteCost, cheapestQuote, routesTo, projectClub, bonusTransfer, directCpm, bonusLimit, cartBug,
  type Partnership, type QuoteInput,
} from "@/domain/calculators";

export type CalcProgram = { id: string; name: string; color: string };
export type CalcPartner = Partnership;
export type CalcClub = { id: string; programId: string; name: string; modality: string; miles: number; monthlyCents: number; signupBonus: number };
export type CalcCpmRef = { label: string; detail: string; cpmCents: number };

type Cat = "quotes" | "routes" | "clubs" | "transfers";
const CATS: [Cat | "all", string][] = [["all", "Todas"], ["quotes", "Cotações"], ["routes", "Rotas & Parcerias"], ["clubs", "Clubes & Assinaturas"], ["transfers", "Transferências & CPM"]];

const money = (v: string) => (v ? parseBRLToCents(v) ?? 0 : 0);
const pct = (v: string) => Number(v.replace(",", ".")) || 0;
const brl = (c: number | null | undefined) => (c == null ? "—" : fmtBRL(c));
const cpm = (c: number | null | undefined) => (c == null ? "—" : `${fmtBRL(c)} / milheiro`);
const ratioTxt = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

// ---------- campos ----------
function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return <span className="mb-1 block text-xs font-medium text-muted">{children}{hint && <span className="ml-1 font-normal text-zinc-500">{hint}</span>}</span>;
}
function PtsInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      <div className="relative">
        <input className="input pr-12 tabular-nums" inputMode="numeric" placeholder="0" value={value} aria-label={label} onChange={(e) => onChange(e.target.value ? fmtPts(parsePts(e.target.value)) : "")} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-muted">PTS</span>
      </div>
    </label>
  );
}
function MoneyInput({ label, value, onChange, hint, currency, onCurrency, right }: { label: string; value: string; onChange: (v: string) => void; hint?: string; currency?: "BRL" | "USD"; onCurrency?: (c: "BRL" | "USD") => void; right?: React.ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between"><Label hint={hint}>{label}</Label>{right}</span>
      <div className="flex gap-1.5">
        {onCurrency ? (
          <button type="button" className="btn-ghost h-10 w-12 shrink-0 px-0 text-xs font-semibold" onClick={() => onCurrency(currency === "USD" ? "BRL" : "USD")} aria-label={`${label}: alternar entre real e dólar`} title="Alternar entre R$ e US$">{currency === "USD" ? "US$" : "R$"}</button>
        ) : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-panel2 text-xs font-semibold text-muted">R$</span>}
        <input className="input tabular-nums" inputMode="decimal" placeholder="0,00" value={value} aria-label={label} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} />
      </div>
    </label>
  );
}
function PctInput({ label, value, onChange, quick, hint }: { label: string; value: string; onChange: (v: string) => void; quick?: number[]; hint?: string }) {
  return (
    <label className="block">
      <Label hint={hint}>{label}</Label>
      <div className="relative">
        <input className="input pr-8 tabular-nums" inputMode="decimal" placeholder="0" value={value} aria-label={label} onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ""))} />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-muted">%</span>
      </div>
      {quick && (
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {quick.map((q) => <button key={q} type="button" className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${pct(value) === q ? "border-accent bg-accent/15 text-accent-light" : "border-line text-muted hover:text-white"}`} onClick={() => onChange(String(q))}>+{q}%</button>)}
        </span>
      )}
    </label>
  );
}
/** "Buscar" CPM: suas contas, fornecedores e valor de mercado. */
function CpmLookup({ refs, onPick }: { refs: CalcCpmRef[]; onPick: (cents: number) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = refs.filter((r) => `${r.label} ${r.detail}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <button type="button" className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium text-muted hover:text-white" onClick={() => setOpen(true)} aria-label="Buscar referências de CPM"><Search className="h-3 w-3" />Buscar</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Referências de CPM">
        <input className="input mb-3" placeholder="Filtrar por programa…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Filtrar referências" />
        {list.length === 0 ? <p className="py-6 text-center text-sm text-muted">Nenhuma referência. Cadastre contas com custo ou fornecedores com preço.</p> : (
          <ul className="max-h-80 divide-y divide-line overflow-y-auto rounded-xl border border-line" aria-label="Referências de CPM">
            {list.map((r, i) => (
              <li key={i}>
                <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-panel2" onClick={() => { onPick(r.cpmCents); setOpen(false); }}>
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.label}</span><span className="text-xs text-muted">{r.detail}</span></span>
                  <span className="tabular-nums font-semibold">{fmtBRL(r.cpmCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  );
}
const centsTxt = (c: number) => (c / 100).toFixed(2).replace(".", ",");
function Stat({ label, value, strong, tone }: { label: string; value: React.ReactNode; strong?: boolean; tone?: "ok" | "bad" }) {
  return (
    <div className={`rounded-xl border border-line p-3 ${strong ? "bg-panel2" : ""}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? "text-lg font-bold" : "font-semibold"} ${tone === "ok" ? "text-ok" : tone === "bad" ? "text-red-400" : ""}`}>{value}</p>
    </div>
  );
}
const Empty = ({ children }: { children: React.ReactNode }) => <p className="rounded-xl border border-dashed border-line px-3 py-4 text-center text-sm text-muted">{children}</p>;

// ---------- 1. Comparador de cotações ----------
type Q = { programId: string; points: string; cpm: string; boarding: string; boardingCur: "BRL" | "USD"; other: string; otherCur: "BRL" | "USD"; sale: string };
const NEW_Q: Q = { programId: "", points: "", cpm: "", boarding: "", boardingCur: "BRL", other: "", otherCur: "BRL", sale: "" };

function QuoteComparator({ programs, refs }: { programs: CalcProgram[]; refs: CalcCpmRef[] }) {
  const [qs, setQs] = useState<Q[]>([NEW_Q]);
  const [rate, setRate] = useState("");
  const [iof, setIof] = useState("3,5");
  const [text, setText] = useState<string | null>(null);
  const usesUsd = qs.some((q) => q.boardingCur === "USD" || q.otherCur === "USD");
  const rateMilli = Math.round(pct(rate) * 1000);
  const toBrl = (v: string, cur: "BRL" | "USD") => (cur === "USD" ? usdToBrlCents(money(v), rateMilli, pct(iof)) : money(v));
  const inputs: QuoteInput[] = qs.map((q) => ({ points: parsePts(q.points), cpmCents: money(q.cpm), boardingCents: toBrl(q.boarding, q.boardingCur), otherCents: toBrl(q.other, q.otherCur), saleCents: money(q.sale) || null }));
  const best = qs.length > 1 ? cheapestQuote(inputs) : null;
  const set = (i: number, patch: Partial<Q>) => setQs(qs.map((q, n) => (n === i ? { ...q, ...patch } : q)));
  const name = (q: Q, i: number) => programs.find((p) => p.id === q.programId)?.name ?? `Cotação ${i + 1}`;

  function generate() {
    const filled = inputs.map((x, i) => ({ x, i, r: quoteCost(x) })).filter(({ x }) => x.points > 0);
    if (!filled.length) return toast("Preencha os pontos de ao menos uma cotação", "error");
    const lines = filled.map(({ x, i, r }) => {
      const q = qs[i]!;
      return [`*${name(q, i)}*${best === i ? " (menor custo)" : ""}`, `${fmtPts(x.points)} pontos + ${brl(r.feesCents)} de taxas`, x.saleCents ? `Valor: ${brl(x.saleCents)}` : `Custo final: ${brl(r.totalCents)}`].join("\n");
    });
    setText(`Cotação da sua passagem\n\n${lines.join("\n\n")}`);
  }
  return (
    <div className="space-y-3">
      {qs.map((q, i) => {
        const r = quoteCost(inputs[i]!);
        return (
          <div key={i} className={`rounded-xl border p-3 ${best === i ? "border-ok/60" : "border-line"}`} aria-label={`Cotação ${i + 1}`} role="group">
            <div className="mb-3 flex items-center gap-2">
              <select className="input h-8 w-auto py-0 text-sm" value={q.programId} onChange={(e) => set(i, { programId: e.target.value })} aria-label={`Programa da cotação ${i + 1}`}>
                <option value="">Cotação {i + 1}</option>{programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {best === i && <span className="inline-flex items-center gap-1 rounded-full bg-ok/15 px-2 py-0.5 text-[11px] font-semibold text-ok"><Trophy className="h-3 w-3" />Menor custo</span>}
              {qs.length > 1 && <button type="button" className="btn-subtle ml-auto h-8 w-8 px-0" onClick={() => setQs(qs.filter((_, n) => n !== i))} aria-label={`Remover cotação ${i + 1}`}><X className="h-4 w-4" /></button>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <PtsInput label="Pontos" value={q.points} onChange={(v) => set(i, { points: v })} />
              <MoneyInput label="CPM" value={q.cpm} onChange={(v) => set(i, { cpm: v })} right={<CpmLookup refs={refs} onPick={(c) => set(i, { cpm: centsTxt(c) })} />} />
              <MoneyInput label="Embarque" value={q.boarding} onChange={(v) => set(i, { boarding: v })} currency={q.boardingCur} onCurrency={(c) => set(i, { boardingCur: c })} />
              <MoneyInput label="Outras taxas" value={q.other} onChange={(v) => set(i, { other: v })} currency={q.otherCur} onCurrency={(c) => set(i, { otherCur: c })} />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Custo em pontos" value={inputs[i]!.points ? brl(r.pointsCostCents) : "—"} />
              <Stat label="Taxas totais" value={brl(r.feesCents)} />
              <Stat label="Custo final" value={inputs[i]!.points || r.feesCents ? brl(r.totalCents) : "—"} strong />
              <Stat label="Lucro estimado" value={r.profitCents == null ? "—" : `${brl(r.profitCents)}${r.marginPct != null ? ` (${ratioTxt(r.marginPct)}%)` : ""}`} strong tone={r.profitCents == null ? undefined : r.profitCents >= 0 ? "ok" : "bad"} />
            </div>
            <div className="mt-3 max-w-xs"><MoneyInput label="Venda (cliente)" value={q.sale} onChange={(v) => set(i, { sale: v })} /></div>
          </div>
        );
      })}
      {usesUsd && (
        <div className="grid gap-3 rounded-xl border border-line p-3 sm:grid-cols-2" aria-label="Câmbio">
          <MoneyInput label="Dólar turismo" hint="(R$ por US$)" value={rate} onChange={setRate} />
          <PctInput label="IOF" value={iof} onChange={setIof} />
          {!rateMilli && <p className="text-xs text-amber-300 sm:col-span-2">Informe o dólar turismo para converter as taxas em US$.</p>}
        </div>
      )}
      <button type="button" className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line py-3 text-sm text-muted hover:text-white" onClick={() => setQs([...qs, NEW_Q])}><Plus className="h-4 w-4" />Adicionar outra cotação para comparar</button>
      <button type="button" className="btn-primary w-full" onClick={generate}>Gerar cotação</button>
      <Modal open={text !== null} onClose={() => setText(null)} title="Cotação para o cliente" footer={<button className="btn-primary" onClick={() => { navigator.clipboard?.writeText(text ?? "").then(() => toast("Cotação copiada"), () => toast("Não foi possível copiar", "error")); }}><Copy className="h-4 w-4" />Copiar</button>}>
        <pre className="whitespace-pre-wrap rounded-xl bg-panel2 p-3 text-sm" aria-label="Texto da cotação">{text}</pre>
      </Modal>
    </div>
  );
}

// ---------- 2. Rotas de transferência ----------
function TransferRoutes({ programs, partners }: { programs: CalcProgram[]; partners: CalcPartner[] }) {
  const [to, setTo] = useState("");
  const [points, setPoints] = useState("");
  const targets = programs.filter((p) => partners.some((x) => x.toId === p.id));
  const routes = to ? routesTo(partners, to) : [];
  const pname = (id: string) => programs.find((p) => p.id === id)?.name ?? "?";
  const n = parsePts(points);
  if (!partners.length) return <Empty>Nenhuma parceria cadastrada ainda. O administrador cadastra em Administração › Calculadoras.</Empty>;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><Label>Programa de destino</Label>
          <select className="input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Programa de destino">
            <option value="">Para onde deseja transferir seus pontos?</option>{targets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <PtsInput label="Pontos na origem" hint="(opcional)" value={points} onChange={setPoints} />
      </div>
      {to && (routes.length === 0 ? <Empty>Nenhuma rota até {pname(to)}.</Empty> : (
        <ul className="space-y-2" aria-label="Rotas encontradas">
          {routes.map((r) => (
            <li key={r.path.join(">")} className="flex flex-wrap items-center gap-2 rounded-xl border border-line px-3 py-2.5 text-sm">
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${r.legs.length === 1 ? "bg-ok/15 text-ok" : "bg-amber-500/15 text-amber-300"}`}>{r.legs.length === 1 ? "Direta" : `${r.legs.length - 1} escala`}</span>
              {r.path.map((id, k) => (
                <span key={k} className="flex items-center gap-2">
                  {k > 0 && <span className="flex items-center gap-1 text-xs text-muted"><ArrowRight className="h-3.5 w-3.5" />{ratioTxt(r.legs[k - 1]!.fromUnits)}:{ratioTxt(r.legs[k - 1]!.toUnits)}</span>}
                  <span className="font-medium">{pname(id)}</span>
                </span>
              ))}
              <span className="ml-auto text-right tabular-nums text-muted">
                {n > 0 ? <><b className="text-white">{fmtPts(Math.floor(n * r.ratio))}</b> no destino</> : <>1.000 → <b className="text-white">{fmtPts(Math.floor(1000 * r.ratio))}</b></>}
              </span>
            </li>
          ))}
        </ul>
      ))}
      <p className="text-xs text-muted">Paridades sem bônus. Confira a regra vigente no site do programa antes de transferir.</p>
    </div>
  );
}

// ---------- 3. Simulador de assinatura ----------
type ClubV = { clubId: string; programId: string; plan: string; miles: string; monthly: string; months: string; signup: string; bMiles: string; bMilesM: string; bPct: string; bPctM: string; every: string; everyMiles: string; dFix: string; dPct: string; dFixFor: string; dFixM: string; dPctFor: string; dPctM: string; opts: Record<string, boolean> };
const NEW_CLUB: ClubV = { clubId: "", programId: "", plan: "", miles: "", monthly: "", months: "12", signup: "", bMiles: "", bMilesM: "", bPct: "", bPctM: "", every: "", everyMiles: "", dFix: "", dPct: "", dFixFor: "", dFixM: "", dPctFor: "", dPctM: "", opts: {} };
const BONUS_OPTS: [string, string][] = [["signup", "Milhas bônus ao assinar"], ["bMiles", "Milhas bônus por X meses"], ["bPct", "Milhas bônus (em %) por X meses"], ["every", "Milhas bônus a cada X meses (ex.: bônus de permanência)"]];
const DISC_OPTS: [string, string][] = [["dFix", "Desconto em R$ todos os meses"], ["dPct", "Desconto em % todos os meses"], ["dFixFor", "Desconto em R$ por X meses"], ["dPctFor", "Desconto em % por X meses"]];

function ClubSimulator({ programs, clubs }: { programs: CalcProgram[]; clubs: CalcClub[] }) {
  const [v, setV] = useState<ClubV>(NEW_CLUB);
  const set = (p: Partial<ClubV>) => setV((cur) => ({ ...cur, ...p }));
  const on = (k: string) => !!v.opts[k];
  const toggle = (k: string) => setV((cur) => ({ ...cur, opts: { ...cur.opts, [k]: !cur.opts[k] } }));
  const progs = programs.filter((p) => clubs.some((c) => c.programId === p.id));
  const plans = [...new Set(clubs.filter((c) => c.programId === v.programId).map((c) => c.name))];
  const modalities = clubs.filter((c) => c.programId === v.programId && c.name === v.plan);
  function pick(c: CalcClub) {
    setV((cur) => ({ ...cur, clubId: c.id, miles: fmtPts(c.miles), monthly: centsTxt(c.monthlyCents), signup: c.signupBonus ? fmtPts(c.signupBonus) : "", opts: { ...cur.opts, signup: c.signupBonus > 0 } }));
  }
  const n = (s: string) => parsePts(s);
  const miles = n(v.miles);
  const monthly = money(v.monthly);
  const r = miles > 0 && monthly >= 0 && v.monthly ? projectClub({
    miles, monthlyCents: monthly, months: Number(v.months) || 12,
    signupBonus: on("signup") ? n(v.signup) : 0,
    bonusMiles: on("bMiles") ? { miles: n(v.bMiles), months: Number(v.bMilesM) || 0 } : undefined,
    bonusPct: on("bPct") ? { pct: pct(v.bPct), months: Number(v.bPctM) || 0 } : undefined,
    bonusEvery: on("every") ? { miles: n(v.everyMiles), every: Number(v.every) || 0 } : undefined,
    discountCents: on("dFix") ? money(v.dFix) : 0,
    discountPct: on("dPct") ? pct(v.dPct) : 0,
    discountCentsFor: on("dFixFor") ? { cents: money(v.dFixFor), months: Number(v.dFixM) || 0 } : undefined,
    discountPctFor: on("dPctFor") ? { pct: pct(v.dPctFor), months: Number(v.dPctM) || 0 } : undefined,
  }) : null;
  const monthsIn = (k: keyof ClubV, label: string) => <label className="block"><Label>{label}</Label><input className="input tabular-nums" inputMode="numeric" value={v[k] as string} onChange={(e) => set({ [k]: e.target.value.replace(/\D/g, "").slice(0, 3) })} aria-label={label} /></label>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line p-3">
        <p className="kicker mb-2">Catálogo de clubes</p>
        {clubs.length === 0 ? <p className="text-sm text-muted">Nenhum plano no catálogo ainda. Preencha as milhas e a mensalidade abaixo.</p> : (
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block"><Label>Programa</Label><select className="input" value={v.programId} onChange={(e) => set({ programId: e.target.value, plan: "", clubId: "" })} aria-label="Programa do clube"><option value="">Selecione</option>{progs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="block"><Label>Plano</Label><select className="input" value={v.plan} disabled={!v.programId} onChange={(e) => { const c = clubs.filter((x) => x.programId === v.programId && x.name === e.target.value); set({ plan: e.target.value, clubId: "" }); if (c.length === 1) pick(c[0]!); }} aria-label="Plano do clube"><option value="">{v.programId ? "Selecione" : "Selecione um programa primeiro"}</option>{plans.map((p) => <option key={p}>{p}</option>)}</select></label>
            <label className="block"><Label>Modalidade</Label><select className="input" value={v.clubId} disabled={!v.plan} onChange={(e) => { const c = clubs.find((x) => x.id === e.target.value); if (c) pick(c); }} aria-label="Modalidade do clube"><option value="">{v.plan ? "Selecione" : "Selecione um plano primeiro"}</option>{modalities.map((c) => <option key={c.id} value={c.id}>{c.modality}</option>)}</select></label>
          </div>
        )}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <PtsInput label="Milhas do plano (sem bônus)" value={v.miles} onChange={(x) => set({ miles: x })} />
        <MoneyInput label="Valor da mensalidade" value={v.monthly} onChange={(x) => set({ monthly: x })} />
        {monthsIn("months", "Permanecer no plano por (meses)")}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2 rounded-xl border border-line p-3"><legend className="kicker px-1">Bônus e adesão</legend>
          {BONUS_OPTS.map(([k, l]) => (
            <div key={k}>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on(k)} onChange={() => toggle(k)} />{l}</label>
              {on(k) && (
                <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                  {k === "signup" && <PtsInput label="Milhas ao assinar" value={v.signup} onChange={(x) => set({ signup: x })} />}
                  {k === "bMiles" && <><PtsInput label="Milhas extras por mês" value={v.bMiles} onChange={(x) => set({ bMiles: x })} />{monthsIn("bMilesM", "Por quantos meses")}</>}
                  {k === "bPct" && <><PctInput label="Bônus sobre o plano" value={v.bPct} onChange={(x) => set({ bPct: x })} />{monthsIn("bPctM", "Por quantos meses")}</>}
                  {k === "every" && <><PtsInput label="Milhas de bônus" value={v.everyMiles} onChange={(x) => set({ everyMiles: x })} />{monthsIn("every", "A cada quantos meses")}</>}
                </div>
              )}
            </div>
          ))}
        </fieldset>
        <fieldset className="space-y-2 rounded-xl border border-line p-3"><legend className="kicker px-1">Descontos aplicáveis</legend>
          {DISC_OPTS.map(([k, l]) => (
            <div key={k}>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={on(k)} onChange={() => toggle(k)} />{l}</label>
              {on(k) && (
                <div className="mt-2 grid grid-cols-2 gap-2 pl-6">
                  {k === "dFix" && <MoneyInput label="Desconto por mês" value={v.dFix} onChange={(x) => set({ dFix: x })} />}
                  {k === "dPct" && <PctInput label="Desconto por mês" value={v.dPct} onChange={(x) => set({ dPct: x })} />}
                  {k === "dFixFor" && <><MoneyInput label="Desconto" value={v.dFixFor} onChange={(x) => set({ dFixFor: x })} />{monthsIn("dFixM", "Por quantos meses")}</>}
                  {k === "dPctFor" && <><PctInput label="Desconto" value={v.dPctFor} onChange={(x) => set({ dPctFor: x })} />{monthsIn("dPctM", "Por quantos meses")}</>}
                </div>
              )}
            </div>
          ))}
        </fieldset>
      </div>
      {!r ? <Empty>Preencha as milhas e o valor da mensalidade pra ver a prévia.</Empty> : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="CPM médio" value={brl(r.avgCpmCents)} strong />
            <Stat label="Total de milhas" value={fmtPts(r.totalMiles)} />
            <Stat label="Total pago" value={brl(r.totalPaidCents)} />
          </div>
          <div className="max-h-80 overflow-auto rounded-xl border border-line">
            <table className="table-base" aria-label="Projeção mês a mês">
              <thead><tr><th>Mês</th><th className="text-right">Milhas</th><th className="text-right">Bônus</th><th className="text-right">Pago</th><th className="text-right">CPM do mês</th><th className="text-right">Acumulado</th></tr></thead>
              <tbody>
                {r.rows.map((x) => (
                  <tr key={x.month}><td>Mês {x.month}</td><td className="text-right tabular-nums">{fmtPts(x.miles)}</td><td className="text-right tabular-nums text-ok">{x.bonus ? `+${fmtPts(x.bonus)}` : "—"}</td><td className="text-right tabular-nums">{brl(x.paidCents)}</td><td className="text-right tabular-nums">{brl(x.cpmCents)}</td><td className="text-right tabular-nums text-muted">{fmtPts(x.totalMiles)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ---------- 4. Transferência bonificada ----------
function BonusTransferCalc({ refs }: { refs: CalcCpmRef[] }) {
  const [points, setPoints] = useState("");
  const [bonus, setBonus] = useState("");
  const [pb, setPb] = useState("");
  const [c, setC] = useState("");
  const n = parsePts(points);
  const r = n > 0 && bonus !== "" ? bonusTransfer({ points: n, bonusPct: pct(bonus), pointsbackPct: pct(pb), cpmCents: money(c) || undefined }) : null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PtsInput label="Quantas milhas você irá transferir?" value={points} onChange={setPoints} />
        <PctInput label="Bonificação" value={bonus} onChange={setBonus} quick={[80, 90, 100, 120]} />
        <PctInput label="Pointsback" hint="(opcional)" value={pb} onChange={setPb} />
        <MoneyInput label="Custo do milheiro (CPM)" hint="(opcional)" value={c} onChange={setC} right={<CpmLookup refs={refs} onPick={(x) => setC(centsTxt(x))} />} />
      </div>
      <p className="text-xs text-muted">Informe quanto pagou por cada 1.000 pontos na origem para saber o custo final por milha no destino e o preço mínimo de venda.</p>
      {!r ? <Empty>Preencha a quantidade de milhas e a bonificação pra calcular.</Empty> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Bônus" value={`+${fmtPts(r.bonus)}`} tone="ok" />
          <Stat label="Milhas recebidas" value={fmtPts(r.received)} strong />
          <Stat label="Pointsback (na origem)" value={r.pointsback ? fmtPts(r.pointsback) : "—"} />
          <Stat label="Novo CPM / venda mínima" value={brl(r.finalCpmCents)} strong />
        </div>
      )}
    </div>
  );
}

// ---------- 5. CPM da compra direta ----------
function DirectCpmCalc() {
  const [miles, setMiles] = useState("");
  const [total, setTotal] = useState("");
  const r = parsePts(miles) > 0 && money(total) > 0 ? directCpm(parsePts(miles), money(total)) : null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PtsInput label="Quantas milhas você está comprando?" value={miles} onChange={setMiles} />
        <MoneyInput label="Valor total a pagar" value={total} onChange={setTotal} />
      </div>
      {r == null ? <Empty>Preencha as milhas e o valor a pagar pra calcular.</Empty> : <div className="max-w-xs"><Stat label="Custo do milheiro" value={cpm(r)} strong /></div>}
    </div>
  );
}

// ---------- 6. Limite de bonificação ----------
function BonusLimitCalc() {
  const [max, setMax] = useState("");
  const [bonus, setBonus] = useState("");
  const [pf, setPf] = useState("1");
  const [pt, setPt] = useState("1");
  const r = bonusLimit({ maxBonus: parsePts(max), bonusPct: pct(bonus), parityFrom: pct(pf) || 1, parityTo: pct(pt) || 1 });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <PtsInput label="Limite de bonificação máxima" value={max} onChange={setMax} />
        <PctInput label="Bonificação da promoção" value={bonus} onChange={setBonus} quick={[80, 90, 100, 120]} />
        <div><Label>Paridade (origem = destino)</Label>
          <div className="flex items-center gap-2">
            <input className="input text-center tabular-nums" inputMode="decimal" value={pf} onChange={(e) => setPf(e.target.value.replace(/[^\d,]/g, ""))} aria-label="Paridade na origem" />
            <span className="text-muted">=</span>
            <input className="input text-center tabular-nums" inputMode="decimal" value={pt} onChange={(e) => setPt(e.target.value.replace(/[^\d,]/g, ""))} aria-label="Paridade no destino" />
          </div>
        </div>
      </div>
      {!r ? <Empty>Preencha o limite e a bonificação em % pra calcular.</Empty> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Transferir até" value={`${fmtPts(r.origin)} pts`} strong />
          <Stat label="Chegam sem bônus" value={fmtPts(r.destBase)} />
          <Stat label="Bônus máximo" value={`+${fmtPts(r.bonus)}`} tone="ok" />
          <Stat label="Total no destino" value={fmtPts(r.received)} />
        </div>
      )}
    </div>
  );
}

// ---------- 7. Bug do carrinho ----------
function CartBugCalc({ refs }: { refs: CalcCpmRef[] }) {
  const [miles, setMiles] = useState("");
  const [bonus, setBonus] = useState("");
  const [used, setUsed] = useState("");
  const [c, setC] = useState("");
  const [cash, setCash] = useState("");
  const n = parsePts(miles);
  const r = n > 0 && bonus !== "" && (money(cash) > 0 || parsePts(used) > 0) ? cartBug({ miles: n, bonusPct: pct(bonus), pointsUsed: parsePts(used), pointsCpmCents: money(c) || undefined, cashCents: money(cash) }) : null;
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <PtsInput label="Milhas a transferir" value={miles} onChange={setMiles} />
        <PctInput label="Bônus da transferência" value={bonus} onChange={setBonus} quick={[80, 100, 120]} />
      </div>
      <p className="kicker">Composição do pagamento</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <PtsInput label="Pontos usados" value={used} onChange={setUsed} />
        <MoneyInput label="CPM dos pontos usados" hint="(opcional)" value={c} onChange={setC} right={<CpmLookup refs={refs} onPick={(x) => setC(centsTxt(x))} />} />
        <MoneyInput label="Dinheiro pago" value={cash} onChange={setCash} />
      </div>
      {!r ? <Empty>Preencha as milhas, o bônus e o valor a pagar pra calcular.</Empty> : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Custo total" value={brl(r.costCents)} />
          <Stat label="Milhas recebidas" value={fmtPts(r.received)} strong />
          <Stat label="CPM sem bônus" value={brl(r.cpmWithoutBonusCents)} />
          <Stat label="CPM final" value={brl(r.finalCpmCents)} strong tone="ok" />
        </div>
      )}
    </div>
  );
}

// ---------- página ----------
const CARDS: { id: string; cat: Cat; kicker: string; title: string; text: string; icon: React.ElementType; top?: boolean }[] = [
  { id: "comparador", cat: "quotes", kicker: "Cotações", title: "Comparador de Cotações", text: "Compare o custo final entre programas, converta taxas em dólar com turismo + IOF e calcule o lucro real.", icon: Scale, top: true },
  { id: "rotas", cat: "routes", kicker: "Parcerias", title: "Rotas de Transferência", text: "Descubra caminhos de acúmulo e paridades diretas e com escalas entre programas parceiros.", icon: RouteIcon },
  { id: "assinatura", cat: "clubs", kicker: "Clubes", title: "Simulador de Assinatura", text: "Projete o CPM médio e o total de milhas mês a mês com bônus de adesão, permanência e descontos.", icon: CalendarClock },
  { id: "transferencia-bonificada", cat: "transfers", kicker: "Promoções", title: "Transferência Bonificada", text: "Calcule o saldo recebido com bônus de transferência, o pointsback e o novo CPM médio.", icon: ArrowLeftRight },
  { id: "cpm", cat: "transfers", kicker: "Compra direta", title: "Custo do Milheiro (CPM)", text: "Descubra quanto você paga por cada 1.000 milhas em compras diretas com desconto.", icon: Coins },
  { id: "limite-bonificacao", cat: "transfers", kicker: "Regulamentos", title: "Limite de Bonificação", text: "Descubra o limite exato de pontos para transferir sem perder bônus excedente.", icon: Gauge },
  { id: "bug-do-carrinho", cat: "transfers", kicker: "Misto", title: "Bug do carrinho", text: "Calcule o CPM final em compras híbridas (dinheiro + pontos) combinadas com bônus de transferência.", icon: ShoppingCart },
];

export function Calculators({ programs, partners, clubs, refs }: { programs: CalcProgram[]; partners: CalcPartner[]; clubs: CalcClub[]; refs: CalcCpmRef[] }) {
  const [cat, setCat] = useState<Cat | "all">("all");
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<string>>(new Set(["comparador"]));
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (CARDS.some((c) => c.id === h)) {
      setOpen(new Set([h]));
      setTimeout(() => document.getElementById(h)?.scrollIntoView({ block: "start" }));
    }
  }, []);
  const list = useMemo(() => CARDS.filter((c) => (cat === "all" || c.cat === cat) && `${c.title} ${c.text} ${c.kicker}`.toLowerCase().includes(q.trim().toLowerCase())), [cat, q]);
  const toggle = (id: string) => {
    const s = new Set(open);
    if (s.has(id)) s.delete(id); else s.add(id);
    setOpen(s);
    history.replaceState(null, "", s.has(id) ? `#${id}` : location.pathname);
  };
  const body = (id: string) => {
    switch (id) {
      case "comparador": return <QuoteComparator programs={programs} refs={refs} />;
      case "rotas": return <TransferRoutes programs={programs} partners={partners} />;
      case "assinatura": return <ClubSimulator programs={programs} clubs={clubs} />;
      case "transferencia-bonificada": return <BonusTransferCalc refs={refs} />;
      case "cpm": return <DirectCpmCalc />;
      case "limite-bonificacao": return <BonusLimitCalc />;
      default: return <CartBugCalc refs={refs} />;
    }
  };
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1" role="tablist" aria-label="Categorias">
          {CATS.map(([k, l]) => <button key={k} role="tab" aria-selected={cat === k} className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium ${cat === k ? "bg-panel2 text-white" : "text-muted hover:text-white"}`} onClick={() => setCat(k)}>{l}</button>)}
        </div>
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar calculadora…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar calculadora" />
        </div>
      </div>
      {list.length === 0 && <Empty>Nenhuma calculadora encontrada.</Empty>}
      <div className="space-y-3">
        {list.map((c) => {
          const isOpen = open.has(c.id);
          const Icon = c.icon;
          return (
            <section key={c.id} id={c.id} className={`card scroll-mt-20 overflow-hidden ${isOpen ? "ring-1 ring-accent/40" : ""}`} aria-label={c.title}>
              <button type="button" onClick={() => toggle(c.id)} aria-expanded={isOpen} className="flex w-full items-start gap-3 p-4 text-left">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-panel2 text-accent-light"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-accent-light">{c.kicker}</span>
                    {c.top && <span className="rounded-full bg-ok/15 px-2 py-0.5 text-[10px] font-semibold text-ok">Mais utilizada</span>}
                  </span>
                  <span className="mt-0.5 block font-semibold">{c.title}</span>
                  <span className="block text-sm text-muted">{c.text}</span>
                </span>
                <span className="btn-ghost h-8 shrink-0 gap-1 px-3 text-xs">{isOpen ? <>Recolher<ChevronUp className="h-3.5 w-3.5" /></> : <>Usar calculadora<ChevronDown className="h-3.5 w-3.5" /></>}</span>
              </button>
              {isOpen && <div className="border-t border-line p-4">{body(c.id)}</div>}
            </section>
          );
        })}
      </div>
    </>
  );
}
