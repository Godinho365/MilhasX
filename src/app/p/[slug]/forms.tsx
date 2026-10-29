"use client";
import { useId, useState } from "react";
import { ArrowLeftRight, Check, CheckCircle2, Gem, MessageCircle, Minus, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { AIRPORTS } from "@/domain/airports";
import { parseBRLToCents } from "@/lib/format";
import type { PageDesign } from "@/domain/page-design";
import { waLink } from "./central";

// Formulários públicos da Central: "Captação de Viagens" (pedido de cotação em etapas) e
// "Interesse em Gestão". Em `preview` (editor) nada é enviado: só mostra a confirmação.

const label = "mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted";
const box = "h-11 w-full rounded-xl border border-line bg-panel2 px-3 text-sm text-zinc-50 placeholder:text-zinc-500 focus:border-zinc-500 focus:outline-none";

function Pills<T extends string>({ value, options, onChange, name }: { value: T; options: [T, string][]; onChange: (v: T) => void; name: string }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {options.map(([k, l]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} onClick={() => onChange(k)} className={`rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors ${value === k ? "border-transparent bg-zinc-100 text-zinc-900" : "border-line bg-panel text-zinc-300 hover:border-zinc-500"}`}>{l}</button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 text-sm">
      <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span aria-hidden className={`flex h-5 w-5 items-center justify-center rounded-md border ${checked ? "border-transparent bg-[rgb(var(--lime,141_230_112))] text-zinc-950" : "border-line bg-panel"}`}>{checked && <Check className="h-3.5 w-3.5" />}</span>
      {children}
    </label>
  );
}

function Stepper({ name, hint, value, min, max, onChange }: { name: string; hint: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-xl bg-panel2 px-3 py-2.5">
      <span className="text-sm font-medium">{name} <span className="text-xs font-normal text-muted">({hint})</span></span>
      <span className="flex items-center gap-3">
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-panel disabled:opacity-40" disabled={value <= min} onClick={() => onChange(value - 1)} aria-label={`Menos ${name}`}><Minus className="h-4 w-4" /></button>
        <span className="w-4 text-center font-semibold tabular-nums" aria-label={name}>{value}</span>
        <button type="button" className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-panel disabled:opacity-40" disabled={value >= max} onClick={() => onChange(value + 1)} aria-label={`Mais ${name}`}><Plus className="h-4 w-4" /></button>
      </span>
    </div>
  );
}

function AirportInput({ value, onChange, aria, listId }: { value: string; onChange: (v: string) => void; aria: string; listId: string }) {
  return <input className={box} list={listId} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Cidade ou GRU" aria-label={aria} autoComplete="off" />;
}
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Código, nome da cidade ou do aeroporto, sem ligar para acento e maiúsculas. Cidade com mais de um
// aeroporto (Rio, São Paulo, BH) fica com o principal, o primeiro da lista; a agência ajusta na cotação.
// Nome antes do código: "Rio de Janeiro" começa com três letras e virava "RIO".
const codeOf = (v: string) => {
  const t = v.trim();
  const f = fold(t);
  const byName = f && AIRPORTS.find((a) => fold(a.city) === f || fold(a.name) === f);
  if (byName) return byName.code;
  return /^[A-Za-z]{3}(\s|$|—)/.test(t) ? t.slice(0, 3).toUpperCase() : "";
};

type Seg = { from: string; to: string; date: string };

function Thanks({ title, text, whatsapp }: { title: string; text: string; whatsapp: string | null }) {
  const wa = waLink(whatsapp);
  return (
    <div className="card px-6 py-8 text-center" role="status">
      <CheckCircle2 className="mx-auto h-12 w-12 text-green-400" />
      <h2 className="mt-3 text-xl font-bold">{title}</h2>
      <p className="mt-1.5 text-sm text-muted">{text}</p>
      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="btn-primary mt-5 h-11 w-full"><MessageCircle className="h-4 w-4" />Falar no WhatsApp</a>}
    </div>
  );
}

/** "Captação de Viagens": pedido de cotação em duas etapas, vira um pedido em CRM › Novos pedidos. */
export function CaptacaoForm({ slug, agency, design, whatsapp, preview = false }: { slug: string; agency: string; design: PageDesign["captacao"]; whatsapp: string | null; preview?: boolean }) {
  const listId = useId();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [tripType, setTripType] = useState<"ONE_WAY" | "ROUND_TRIP" | "MULTI">("ROUND_TRIP");
  const [cabin, setCabin] = useState<"ECONOMY" | "PREMIUM" | "BUSINESS" | "FIRST">("ECONOMY");
  const [segs, setSegs] = useState<Seg[]>([{ from: "", to: "", date: "" }]);
  const [returnDate, setReturnDate] = useState("");
  const [flexible, setFlexible] = useState(false);
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [bag, setBag] = useState(false);
  const [direct, setDirect] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const setSeg = (i: number, p: Partial<Seg>) => setSegs((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (!preview) {
      if (segs.some((s) => !codeOf(s.from) || !codeOf(s.to))) return setErro("Escolha origem e destino na lista (ou digite o código do aeroporto, ex.: GRU)");
      if (segs.some((s) => !s.date)) return setErro("Informe a data de cada trecho");
      if (tripType === "ROUND_TRIP" && !returnDate) return setErro("Informe a data de volta");
    }
    setErro("");
    setStep(2);
  }
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setStep(3);
    if (!phone.trim()) return setErro("Informe seu WhatsApp para a agência responder");
    const segments = segs.map((s) => ({ origin: codeOf(s.from), destination: codeOf(s.to), date: s.date || null }));
    if (tripType === "ROUND_TRIP") segments.push({ origin: segments[0]!.destination, destination: segments[0]!.origin, date: returnDate || null });
    const extra = [direct && "Prefere voos diretos.", notes.trim()].filter(Boolean).join(" ");
    setBusy(true);
    const r = await fetch(`/api/public/orders/${encodeURIComponent(slug)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerName: name, customerPhone: phone, customerEmail: email || null, tripType, cabin, segments, adults, children, infants, flexibleDates: flexible, checkedBag: bag, budgetCents: design.askBudget ? parseBRLToCents(budget) : null, notes: extra || null, website }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    setStep(3);
  }

  if (step === 3) return <Thanks title={design.thanksTitle} text={design.thanks} whatsapp={whatsapp} />;
  return (
    <div className="card p-5 sm:p-6">
      <h1 className="text-xl font-bold">{design.title}</h1>
      <p className="text-sm text-muted">{agency}</p>
      {design.text && <p className="mt-2 text-sm text-muted">{design.text}</p>}
      <ol className="mt-4 flex gap-2 text-xs font-semibold" aria-label="Etapas">
        {["Sua viagem", "Seus dados"].map((t, i) => <li key={t} className={`flex-1 rounded-full py-1 text-center ${step === i + 1 ? "bg-zinc-100 text-zinc-900" : "bg-panel2 text-muted"}`}>{i + 1}. {t}</li>)}
      </ol>
      {erro && <div className="mt-4"><Alert>{erro}</Alert></div>}
      <datalist id={listId}>{AIRPORTS.map((a) => <option key={a.code} value={`${a.code} — ${a.city}`}>{a.name}</option>)}</datalist>

      {step === 1 ? (
        <form onSubmit={next} noValidate className="mt-5 space-y-5" aria-label="Sua viagem">
          <div><span className={label}>Tipo de viagem</span><Pills name="Tipo de viagem" value={tripType} onChange={(v) => { setTripType(v); if (v !== "MULTI") setSegs((s) => s.slice(0, 1)); }} options={[["ONE_WAY", "Somente ida"], ["ROUND_TRIP", "Ida e volta"], ["MULTI", "Múltiplos trechos"]]} /></div>
          <div><span className={label}>Classe</span><Pills name="Classe" value={cabin} onChange={setCabin} options={[["ECONOMY", "Econômica"], ["PREMIUM", "Premium"], ["BUSINESS", "Executiva"], ["FIRST", "Primeira"]]} /></div>
          {segs.map((s, i) => (
            <div key={i} className="space-y-3">
              {tripType === "MULTI" && <div className="flex items-center justify-between"><span className="text-sm font-semibold">Trecho {i + 1}</span>{i > 0 && <button type="button" className="text-muted hover:text-zinc-100" onClick={() => setSegs((x) => x.filter((_, j) => j !== i))} aria-label={`Remover trecho ${i + 1}`}><Trash2 className="h-4 w-4" /></button>}</div>}
              <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
                <div><span className={label}>Origem</span><AirportInput listId={listId} aria={`Origem${tripType === "MULTI" ? ` do trecho ${i + 1}` : ""}`} value={s.from} onChange={(v) => setSeg(i, { from: v })} /></div>
                <button type="button" className="mb-1.5 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-panel text-muted" onClick={() => setSeg(i, { from: s.to, to: s.from })} aria-label="Inverter origem e destino"><ArrowLeftRight className="h-4 w-4" /></button>
                <div><span className={label}>Destino</span><AirportInput listId={listId} aria={`Destino${tripType === "MULTI" ? ` do trecho ${i + 1}` : ""}`} value={s.to} onChange={(v) => setSeg(i, { to: v })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label><span className={label}>{tripType === "MULTI" ? "Data" : "Data de ida"}</span><input type="date" className={box} value={s.date} onChange={(e) => setSeg(i, { date: e.target.value })} /></label>
                {tripType === "ROUND_TRIP" && <label><span className={label}>Data de volta</span><input type="date" className={box} value={returnDate} min={s.date || undefined} onChange={(e) => setReturnDate(e.target.value)} /></label>}
              </div>
            </div>
          ))}
          {tripType === "MULTI" && segs.length < 6 && <button type="button" className="btn-ghost h-9 bg-panel text-sm" onClick={() => setSegs((x) => [...x, { from: x.at(-1)?.to ?? "", to: "", date: "" }])}><Plus className="h-4 w-4" />Adicionar trecho</button>}
          {design.askFlexible && <Toggle checked={flexible} onChange={setFlexible}>Datas flexíveis (± 3 dias)</Toggle>}
          <div className="space-y-2">
            <span className={label}>Passageiros</span>
            <Stepper name="Adultos" hint="12+ anos" value={adults} min={1} max={9} onChange={setAdults} />
            <Stepper name="Crianças" hint="2 a 11 anos" value={children} min={0} max={8} onChange={setChildren} />
            <Stepper name="Bebês" hint="até 2 anos" value={infants} min={0} max={adults} onChange={setInfants} />
          </div>
          {(design.askBaggage || design.askDirect) && (
            <div className="space-y-2.5">
              <span className={label}>Preferências</span>
              {design.askBaggage && <Toggle checked={bag} onChange={setBag}>Preciso despachar bagagem</Toggle>}
              {design.askDirect && <Toggle checked={direct} onChange={setDirect}>Prefiro voos diretos</Toggle>}
            </div>
          )}
          <button className="btn-primary h-11 w-full">Próximo →</button>
        </form>
      ) : (
        <form onSubmit={send} noValidate={preview} className="mt-5 space-y-4" aria-label="Seus dados">
          <label className="block"><span className={label}>Seu nome *</span><input className={box} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
          <label className="block"><span className={label}>WhatsApp (com DDD) *</span><input className={box} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={30} autoComplete="tel" placeholder="(11) 90000-0000" /></label>
          <label className="block"><span className={label}>E-mail</span><input className={box} type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></label>
          {design.askBudget && <label className="block"><span className={label}>Quanto pretende investir? (opcional)</span><input className={box} value={budget} onChange={(e) => setBudget(e.target.value)} inputMode="decimal" placeholder="R$ 0,00" maxLength={20} /></label>}
          <label className="block"><span className={label}>Observações (opcional)</span><textarea className={`${box} h-20 py-2`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} /></label>
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
          <div className="flex gap-2">
            <button type="button" className="btn-ghost h-11 bg-panel" onClick={() => setStep(1)}>← Voltar</button>
            <button className="btn-primary h-11 flex-1" disabled={busy}>{busy ? "Enviando…" : design.submit}</button>
          </div>
        </form>
      )}
    </div>
  );
}

export const LEAD_PROGRAMS = ["Smiles (Gol)", "LATAM Pass", "Azul Fidelidade", "Livelo", "Esfera", "TAP Miles&Go", "Iberia Plus", "Outros"] as const;
export const INCOME_RANGES = ["Até R$ 3.000", "De R$ 3.000 a R$ 5.000", "De R$ 5.000 a R$ 10.000", "De R$ 10.000 a R$ 20.000", "Acima de R$ 20.000"] as const;

/** "Interesse em Gestão": contato, programas e renda; vira um interessado em CRM › Lista. */
export function GestaoForm({ slug, agency, design, whatsapp, preview = false }: { slug: string; agency: string; design: PageDesign["gestao"]; whatsapp: string | null; preview?: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [programs, setPrograms] = useState<string[]>([]);
  const [income, setIncome] = useState("");
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setDone(true);
    if (!name.trim() || !phone.trim() || !email.trim()) return setErro("Preencha nome, WhatsApp e e-mail");
    setBusy(true);
    const r = await fetch(`/api/public/leads/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone, email, programs, incomeRange: income || null, website }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    setDone(true);
  }
  if (done) return <Thanks title="Interesse enviado!" text={design.thanks} whatsapp={whatsapp} />;
  return (
    <div className="card p-5 sm:p-6">
      <p className="text-sm text-muted">{agency}</p>
      {design.kicker && <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent"><Gem className="h-3.5 w-3.5" />{design.kicker}</span>}
      <h1 className="mt-2 text-xl font-bold">{design.title}</h1>
      {design.text && <p className="mt-1.5 text-sm text-muted">{design.text}</p>}
      {erro && <div className="mt-4"><Alert>{erro}</Alert></div>}
      <form onSubmit={send} noValidate={preview} className="mt-5 space-y-4" aria-label="Interesse em gestão de milhas">
        <label className="block"><span className={label}>Nome completo *</span><input className={box} value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></label>
        <label className="block"><span className={label}>WhatsApp (com DDD) *</span><input className={box} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" maxLength={30} autoComplete="tel" placeholder="(11) 90000-0000" /></label>
        <label className="block"><span className={label}>E-mail *</span><input className={box} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={200} autoComplete="email" /></label>
        {design.askPrograms && (
          <div>
            <span className={label}>Programas que você possui (opcional)</span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Programas que você possui">
              {LEAD_PROGRAMS.map((p) => {
                const on = programs.includes(p);
                return <button key={p} type="button" aria-pressed={on} onClick={() => setPrograms((x) => (on ? x.filter((y) => y !== p) : [...x, p]))} className={`rounded-full border px-3 py-1.5 text-xs font-medium ${on ? "border-transparent bg-zinc-100 text-zinc-900" : "border-line bg-panel text-zinc-300"}`}>{p}</button>;
              })}
            </div>
          </div>
        )}
        {design.askIncome && (
          <label className="block"><span className={label}>Renda mensal média (opcional)</span>
            <select className={box} value={income} onChange={(e) => setIncome(e.target.value)}>
              <option value="">Selecione sua faixa de renda…</option>
              {INCOME_RANGES.map((r) => <option key={r}>{r}</option>)}
            </select>
          </label>
        )}
        <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
        <button className="btn-primary h-11 w-full" disabled={busy}>{busy ? "Enviando…" : `${design.submit} →`}</button>
      </form>
    </div>
  );
}
