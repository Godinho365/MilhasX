"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Star, Search, Coins, Wallet, Bell, BellRing, Trash2, Store as StoreIcon, Filter, Zap, ExternalLink, X, ArrowLeftRight } from "lucide-react";
import { ProgramLogo } from "@/components/program-logo";
import { parseBRLToCents } from "@/lib/format";
import { useNav, refreshSafe } from "@/lib/nav";
import { Switch } from "@/components/form-parts";
import { api } from "@/lib/api";
import { colorFor } from "@/lib/colors";
import { DailySeries } from "@/components/charts";
import { Field, Alert, Empty, Modal } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

const SORTS = [["popular", "Mais populares"], ["points", "Mais pontos"], ["cashback", "Mais cashback"], ["name", "Nome (A-Z)"]] as const;

export function StoresToolbar({ q, fav, programId, sort, programs }: { q: string; fav: boolean; programId: string; sort: string; programs: { id: string; name: string }[] }) {
  const nav = useNav();
  const [filters, setFilters] = useState(false);
  const [draft, setDraft] = useState({ programId, fav });
  const go = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams();
    const base: Record<string, string | null> = { q: q || null, fav: fav ? "1" : null, programa: programId || null, ordem: sort !== "popular" ? sort : null, ...patch };
    for (const [k, v] of Object.entries(base)) if (v) u.set(k, v);
    nav(`/app/purchases${u.size ? `?${u}` : ""}`);
  };
  const active = (programId ? 1 : 0) + (fav ? 1 : 0);
  return (
    <>
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); go({ q: String(new FormData(e.currentTarget).get("q") || "") || null }); }}>
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" name="q" placeholder="Buscar loja" defaultValue={q} key={q} aria-label="Buscar loja" />
        </div>
        <select className="input w-full sm:w-48" value={sort} onChange={(e) => go({ ordem: e.target.value !== "popular" ? e.target.value : null })} aria-label="Ordenar lojas">
          {SORTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <button type="button" className="btn-ghost btn-icon relative" onClick={() => { setDraft({ programId, fav }); setFilters(true); }} aria-label="Mais filtros" title="Mais filtros">
          <Filter className="h-4 w-4" />
          {active > 0 && <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-light px-1 text-[10px] font-bold text-zinc-950">{active}</span>}
        </button>
        <button className="btn-ghost btn-icon" aria-label="Aplicar busca" title="Buscar"><Search className="h-4 w-4" /></button>
      </form>
      {filters && (
        <Modal open onClose={() => setFilters(false)} size="sm" title="Filtros de lojas" footer={<><button className="btn-ghost mr-auto" onClick={() => { setFilters(false); go({ programa: null, fav: null }); }}>Limpar</button><button className="btn-ghost" onClick={() => setFilters(false)}>Fechar</button><button className="btn-primary" onClick={() => { setFilters(false); go({ programa: draft.programId || null, fav: draft.fav ? "1" : null }); }}>Aplicar</button></>}>
          <div className="space-y-4">
            <Field label="Programa de pontos">
              <select className="input" value={draft.programId} onChange={(e) => setDraft({ ...draft, programId: e.target.value })} aria-label="Programa de pontos">
                <option value="">Todos os programas</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Switch checked={draft.fav} onChange={(v) => setDraft({ ...draft, fav: v })} label="Mostrar somente favoritas" />
          </div>
        </Modal>
      )}
    </>
  );
}

type PointsOffer = { pointsPerReal: number; program: string; programId: string; programColor: string; programLogo: string | null; upTo: boolean; perDollar: boolean; club: number | null; regular: number | null; promotion: boolean; promoEndsAt: string | null; link: string | null; observedAt: string | null };
type CashOffer = { percent: number; portal: string; upTo: boolean; link: string | null; observedAt: string | null };
type Store = { id: string; name: string; logo: string | null; favorite: boolean; bestPoints: PointsOffer | null; programs: PointsOffer[]; bestCashback: CashOffer | null; cashbacks: CashOffer[] };
type History = { items: { day: string; program: string; max: number }[]; cashback: { day: string; portal: string; max: number }[] };

const ppr = (o: { pointsPerReal: number; upTo: boolean; perDollar: boolean }) => `${o.upTo ? "Até " : ""}${o.pointsPerReal.toLocaleString("pt-BR")} pts/${o.perDollar ? "US$" : "R$"}`;
const pct = (o: { percent: number; upTo: boolean }) => `${o.upTo ? "Até " : ""}${o.percent.toLocaleString("pt-BR")}% de cashback`;
const pts = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${n === 1 ? "ponto" : "pontos"} por real`;

/** Logo da loja (baixado da fonte) ou, sem ele, as iniciais na cor da loja. */
function StoreLogo({ store, size = 44 }: { store: { id: string; name: string; logo: string | null }; size?: number }) {
  const style = { width: size, height: size };
  if (store.logo) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={`/api/stores/${store.id}/logo?v=${store.logo}`} alt="" width={size} height={size} style={style} className="shrink-0 rounded-full bg-white object-contain p-0.5 ring-1 ring-line" loading="lazy" />;
  }
  const c = colorFor(store.name);
  return (
    <span aria-hidden style={{ ...style, backgroundColor: `${c}22`, color: c, fontSize: Math.round(size * 0.3) }} className="flex shrink-0 items-center justify-center rounded-full font-bold ring-1 ring-line">
      {store.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
    </span>
  );
}

function OfferCell({ kind, title, sub }: { kind: "points" | "cash"; title: string | null; sub: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${kind === "points" ? "bg-blue-500/15 text-blue-300" : "bg-green-500/15 text-green-300"}`}>{kind === "points" ? <Coins className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}</span>
      <div className="min-w-0 text-sm leading-tight">
        <p className="text-[11px] text-muted">{kind === "points" ? "Pontos" : "Cashback"}</p>
        {title ? <><p className="truncate font-semibold">{title}</p><p className="truncate text-[11px] text-muted">{sub}</p></> : <p className="text-muted">Sem oferta</p>}
      </div>
    </div>
  );
}

export function StoresGrid({ items, openId }: { items: Store[]; openId?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Store | null>(() => items.find((s) => s.id === openId) ?? null);
  // A loja aberta fica na URL (?loja=), como na referência: dá para compartilhar e voltar
  const open = (s: Store | null) => {
    setDetails(s);
    const u = new URL(window.location.href);
    if (s) u.searchParams.set("loja", s.id);
    else u.searchParams.delete("loja");
    window.history.replaceState(null, "", u);
  };
  async function fav(s: Store) {
    setBusy(s.id);
    const r = await api<{ favorite: boolean }>(`/api/stores/${s.id}/favorite`, "POST");
    setBusy(null);
    if (!r.ok) return toast(r.erro, "error");
    toast(r.data.favorite ? `${s.name} nos favoritos` : `${s.name} removida dos favoritos`);
    if (details?.id === s.id) setDetails({ ...details, favorite: r.data.favorite });
    refreshSafe(router);
  }
  if (items.length === 0) return <Empty title="Nenhuma loja encontrada" icon={<StoreIcon className="h-5 w-5" />} />;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((s) => (
          <article key={s.id} className={`card relative cursor-pointer p-4 transition hover:border-accent-light/50 hover:shadow-md ${details?.id === s.id ? "border-accent-light ring-1 ring-accent-light/40" : ""}`} onClick={() => open(s)}>
            <div className="flex items-center gap-3">
              <StoreLogo store={s} />
              <h3 className="min-w-0 flex-1 truncate font-semibold">
                <button type="button" className="truncate text-left after:absolute after:inset-0 after:content-['']" onClick={(e) => { e.stopPropagation(); open(s); }} aria-label={`Detalhes de ${s.name}`}>{s.name}</button>
              </h3>
              <button onClick={(e) => { e.stopPropagation(); fav(s); }} disabled={busy === s.id} aria-pressed={s.favorite} aria-label={s.favorite ? `Remover ${s.name} dos favoritos` : `Favoritar ${s.name}`} className="btn-subtle relative z-10 h-8 w-8 px-0">
                <Star className={`h-[18px] w-[18px] ${s.favorite ? "fill-amber-300 text-amber-300" : ""}`} />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3">
              <OfferCell kind="points" title={s.bestPoints ? ppr(s.bestPoints) : null} sub={s.bestPoints ? `${s.bestPoints.program}${s.bestPoints.promotion ? " · promoção" : ""}` : ""} />
              <OfferCell kind="cash" title={s.bestCashback ? `${s.bestCashback.upTo ? "Até " : ""}${s.bestCashback.percent.toLocaleString("pt-BR")}%` : null} sub={s.bestCashback?.portal ?? ""} />
            </div>
          </article>
        ))}
      </div>
      {details && <StoreDrawer store={details} onClose={() => open(null)} onFav={() => fav(details)} busy={busy === details.id} />}
    </>
  );
}

type DrawerTab = "geral" | "pontos" | "cashback" | "historico";

/** Painel lateral da loja: visão geral, pontos por programa, cashback por portal e histórico. */
function StoreDrawer({ store, onClose, onFav, busy }: { store: Store; onClose: () => void; onFav: () => void; busy: boolean }) {
  const [tab, setTab] = useState<DrawerTab>("geral");
  const [hist, setHist] = useState<History | null>(null);
  const [alertOpen, setAlertOpen] = useState(false);
  useEffect(() => {
    setTab("geral");
    setHist(null);
    api<History>(`/api/stores/${store.id}/history`).then((r) => setHist(r.ok ? r.data : { items: [], cashback: [] }));
  }, [store.id]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);
  const best = store.bestPoints;
  const access = best?.link ? { href: best.link, label: `Acessar via ${best.program}` } : store.bestCashback?.link ? { href: store.bestCashback.link, label: `Acessar via ${store.bestCashback.portal}` } : null;
  const tabs: [DrawerTab, string][] = [["geral", "Visão geral"], ["pontos", `Pontos (${store.programs.length})`], ["cashback", `Cashback (${store.cashbacks.length})`], ["historico", "Histórico"]];
  return (
    <div className="fixed inset-0 z-[45]" role="dialog" aria-modal="true" aria-label={store.name}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-[580px] flex-col border-l border-line bg-panel shadow-2xl">
        <header className="space-y-4 border-b border-line p-5">
          <div className="flex items-center gap-4">
            <StoreLogo store={store} size={56} />
            <h2 className="min-w-0 flex-1 truncate text-xl font-semibold">{store.name}</h2>
            <button type="button" onClick={onFav} disabled={busy} aria-pressed={store.favorite} aria-label={store.favorite ? `Remover ${store.name} dos favoritos` : `Favoritar ${store.name}`} className="btn-subtle h-9 w-9 px-0"><Star className={`h-5 w-5 ${store.favorite ? "fill-amber-300 text-amber-300" : ""}`} /></button>
            <button type="button" onClick={onClose} aria-label="Fechar" className="btn-subtle h-9 w-9 px-0"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {access ? <a href={access.href} target="_blank" rel="noopener noreferrer nofollow" className="btn-primary h-10 justify-center"><ExternalLink className="h-4 w-4" /><span className="truncate">{access.label}</span></a> : <span className="btn-ghost h-10 cursor-default justify-center opacity-60">Sem link do parceiro</span>}
            <button type="button" className="btn-ghost h-10 justify-center" onClick={() => setAlertOpen(true)}><Bell className="h-4 w-4" />Configurar alerta</button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-line px-5 [scrollbar-width:none]" role="tablist" aria-label="Seções da loja">
          {tabs.map(([k, l]) => (
            <button key={k} role="tab" type="button" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px whitespace-nowrap border-b-2 px-2 py-3 text-sm font-medium transition-colors ${tab === k ? "border-accent-light text-accent-light" : "border-transparent text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </nav>
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "geral" && <Overview store={store} hist={hist} />}
          {tab === "pontos" && (
            store.programs.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhum programa pontua nesta loja agora.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Pontos por programa">
                {store.programs.map((o) => (
                  <li key={o.program} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    <ProgramLogo programId={o.programId} name={o.program} color={o.programColor} version={o.programLogo} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{o.program}</p>
                      <p className="text-xs text-muted">
                        {o.promotion && <span className="mr-1.5 rounded bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-300">Promoção{o.promoEndsAt ? ` até ${new Date(o.promoEndsAt).toLocaleDateString("pt-BR")}` : ""}</span>}
                        {o.observedAt && `Lido em ${new Date(o.observedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`}
                      </p>
                    </div>
                    <div className="text-right text-sm">
                      <p className="font-semibold">{ppr(o)}</p>
                      {o.regular != null && <p className="text-xs text-muted line-through">Era {o.regular.toLocaleString("pt-BR")}</p>}
                      {o.club != null && <p className="text-xs text-accent-light">Clube: {o.club.toLocaleString("pt-BR")}</p>}
                    </div>
                    {o.link && <a href={o.link} target="_blank" rel="noopener noreferrer nofollow" className="btn-subtle h-8 px-2 text-xs" aria-label={`Abrir ${store.name} no site da ${o.program}`}><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </li>
                ))}
              </ul>
            )
          )}
          {tab === "cashback" && (
            store.cashbacks.length === 0 ? <p className="py-10 text-center text-sm text-muted">Nenhum portal de cashback com oferta para esta loja agora.</p> : (
              <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Cashback por portal">
                {store.cashbacks.map((o) => (
                  <li key={o.portal} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/15 text-green-300"><Wallet className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{o.portal}</p>
                      {o.observedAt && <p className="text-xs text-muted">Lido em {new Date(o.observedAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</p>}
                    </div>
                    <p className="text-sm font-semibold">{pct(o)}</p>
                    {o.link && <a href={o.link} target="_blank" rel="noopener noreferrer nofollow" className="btn-subtle h-8 px-2 text-xs" aria-label={`Abrir ${store.name} na ${o.portal}`}><ExternalLink className="h-3.5 w-3.5" /></a>}
                  </li>
                ))}
              </ul>
            )
          )}
          {tab === "historico" && (
            <div className="space-y-6">
              <section><h3 className="mb-2 text-sm font-semibold">Pontos por real · 30 dias (máximo de cada dia)</h3>{hist ? <DailySeries data={hist.items.map((h) => ({ day: h.day, series: h.program, value: h.max }))} unit="pts" /> : <Loading />}</section>
              <section><h3 className="mb-2 text-sm font-semibold">Cashback · 30 dias (máximo de cada dia)</h3>{hist ? <DailySeries data={hist.cashback.map((h) => ({ day: h.day, series: h.portal, value: h.max }))} unit="%" /> : <Loading />}</section>
            </div>
          )}
        </div>
      </aside>
      {alertOpen && <StoreAlertDialog store={store} onClose={() => setAlertOpen(false)} />}
    </div>
  );
}

const Loading = () => <p className="py-10 text-center text-sm text-muted">Carregando…</p>;

function Overview({ store, hist }: { store: Store; hist: History | null }) {
  const [compare, setCompare] = useState(false);
  const [series, setSeries] = useState<"pontos" | "cashback">("pontos");
  const since = new Date(Date.now() - 7 * 86400_000).toISOString().slice(0, 10);
  const bp = store.bestPoints, bc = store.bestCashback;
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 divide-x divide-line rounded-xl border border-line">
        <div className="flex gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-300"><Coins className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted">Melhor pontuação</p>
            {bp ? <><p className="text-lg font-semibold leading-tight">{bp.upTo ? "Até " : ""}{pts(bp.pointsPerReal)}{bp.perDollar ? " (US$)" : ""}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-muted"><ProgramLogo programId={bp.programId} name={bp.program} color={bp.programColor} version={bp.programLogo} size={16} />via {bp.program}</p></> : <p className="text-sm text-muted">Sem oferta</p>}
          </div>
        </div>
        <div className="flex gap-3 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-300"><Wallet className="h-4 w-4" /></span>
          <div className="min-w-0">
            <p className="text-xs text-muted">Melhor cashback</p>
            {bc ? <><p className="text-lg font-semibold leading-tight">{pct(bc)}</p><p className="mt-1 text-xs text-muted">via {bc.portal}</p></> : <p className="text-sm text-muted">Sem oferta</p>}
          </div>
        </div>
      </div>
      <button type="button" className="btn-ghost h-10 w-full justify-center" onClick={() => setCompare(!compare)} aria-expanded={compare}><ArrowLeftRight className="h-4 w-4" />Comparar pontos e cashback</button>
      {compare && <Compare store={store} />}
      <section>
        <h3 className="mb-3 font-semibold">Últimos 7 dias</h3>
        <div className="mb-3 grid grid-cols-2 rounded-xl bg-panel2 p-1 text-sm" role="tablist" aria-label="Série do gráfico">
          {(["pontos", "cashback"] as const).map((k) => <button key={k} role="tab" type="button" aria-selected={series === k} onClick={() => setSeries(k)} className={`rounded-lg py-1.5 font-medium transition ${series === k ? "bg-panel shadow-sm" : "text-muted hover:text-zinc-100"}`}>{k === "pontos" ? "Pontos" : "Cashback"}</button>)}
        </div>
        {!hist ? <Loading /> : series === "pontos"
          ? <DailySeries data={hist.items.filter((h) => h.day >= since).map((h) => ({ day: h.day, series: h.program, value: h.max }))} unit="pts" />
          : <DailySeries data={hist.cashback.filter((h) => h.day >= since).map((h) => ({ day: h.day, series: h.portal, value: h.max }))} unit="%" />}
      </section>
    </div>
  );
}

/** Quanto rende uma compra em pontos (pelo valor do milheiro) contra o cashback. */
function Compare({ store }: { store: Store }) {
  const [amount, setAmount] = useState("1.000,00");
  const [milheiro, setMilheiro] = useState("20,00");
  const v = (parseBRLToCents(amount) ?? 0) / 100;
  const m = (parseBRLToCents(milheiro) ?? 0) / 100;
  const bp = store.bestPoints, bc = store.bestCashback;
  const points = bp && !bp.perDollar ? Math.floor(v * bp.pointsPerReal) : 0;
  const pointsValue = (points / 1000) * m;
  const cash = bc ? (v * bc.percent) / 100 : 0;
  const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  const win = pointsValue === cash ? null : pointsValue > cash ? "pontos" : "cashback";
  return (
    <div className="space-y-3 rounded-xl border border-line p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Valor da compra (R$)"><input className="input tabular-nums" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
        <Field label="Valor do milheiro (R$)" hint="Quanto você vende mil pontos"><input className="input tabular-nums" inputMode="decimal" value={milheiro} onChange={(e) => setMilheiro(e.target.value)} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className={`rounded-lg p-3 ${win === "pontos" ? "bg-blue-500/10 ring-1 ring-blue-400/40" : "bg-panel2"}`}>
          <p className="text-xs text-muted">Pontos{bp ? ` (${bp.program})` : ""}</p>
          <p className="font-semibold">{points.toLocaleString("pt-BR")} pts ≈ {brl(pointsValue)}</p>
          {bp?.upTo && <p className="text-[11px] text-muted">“Até”: valor máximo da oferta</p>}
        </div>
        <div className={`rounded-lg p-3 ${win === "cashback" ? "bg-green-500/10 ring-1 ring-green-400/40" : "bg-panel2"}`}>
          <p className="text-xs text-muted">Cashback{bc ? ` (${bc.portal})` : ""}</p>
          <p className="font-semibold">{brl(cash)}</p>
        </div>
      </div>
      {win && <p className="text-sm font-medium">{win === "pontos" ? "Pontos rendem mais" : "Cashback rende mais"} nesta compra ({brl(Math.abs(pointsValue - cash))} de diferença).</p>}
    </div>
  );
}

function StoreAlertDialog({ store, onClose }: { store: Store; onClose: () => void }) {
  const [threshold, setThreshold] = useState(String(Math.max(3, Math.ceil((store.bestPoints?.pointsPerReal ?? 2) * 1.5))));
  const [programId, setProgramId] = useState("");
  const [erro, setErro] = useState("");
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(threshold.replace(",", "."));
    if (!(n > 0)) return setErro("Informe a pontuação");
    const r = await api("/api/alerts", "POST", { type: "STORE_POINTS", storeId: store.id, programId: programId || undefined, threshold: Math.round(n * 100) });
    if (!r.ok) return setErro(r.erro);
    toast(`Alerta criado: ${store.name} a partir de ${n.toLocaleString("pt-BR")} pts/R$`);
    onClose();
  }
  return (
    <Modal open onClose={onClose} size="sm" title={`Alerta · ${store.name}`} footer={<><button className="btn-ghost" onClick={onClose}>Cancelar</button><button form="store-alert" className="btn-primary">Criar alerta</button></>}>
      <form id="store-alert" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <Field label="Avisar quando passar de (pts/R$)" required><input className="input" inputMode="decimal" value={threshold} onChange={(e) => setThreshold(e.target.value)} /></Field>
        <Field label="Programa">
          <select className="input" value={programId} onChange={(e) => setProgramId(e.target.value)}>
            <option value="">Qualquer programa</option>
            {store.programs.map((p) => <option key={p.programId} value={p.programId}>{p.program}</option>)}
          </select>
        </Field>
      </form>
    </Modal>
  );
}

export function AlertsPanel(props: {
  alerts: { id: string; kind: string; title: string; text: string; triggered: boolean }[];
  stores: { id: string; name: string }[];
  programs: { id: string; name: string }[];
  accounts: { id: string; name: string }[];
  suggestions: { storeId: string; name: string; threshold: number }[];
}) {
  const router = useRouter();
  const [type, setType] = useState<"STORE_POINTS" | "MIN_BALANCE">("STORE_POINTS");
  const [activating, setActivating] = useState<string | null>(null);
  async function quick(sg: { storeId: string; name: string; threshold: number }) {
    setActivating(sg.storeId);
    const r = await api("/api/alerts", "POST", { type: "STORE_POINTS", storeId: sg.storeId, threshold: sg.threshold * 100 });
    setActivating(null);
    if (!r.ok) return toast(r.erro, "error");
    toast(`Alerta ativado: ${sg.name} a partir de ${sg.threshold}x`);
    refreshSafe(router);
  }
  const [erro, setErro] = useState("");

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const raw = Number(String(f.get("threshold")).replace(/\./g, "").replace(",", "."));
    const body = type === "STORE_POINTS"
      ? { type, storeId: f.get("storeId"), programId: f.get("programId") || undefined, threshold: Math.round(raw * 100) }
      : { type, accountId: f.get("accountId"), threshold: Math.round(raw) };
    const r = await api("/api/alerts", "POST", body);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    form.reset();
    toast("Alerta criado");
    refreshSafe(router);
  }
  async function remove(id: string, title: string) {
    if (!(await confirmDialog({ title: "Excluir alerta?", body: title, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/alerts/${id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Alerta excluído");
    refreshSafe(router);
  }

  return (
    <div className="space-y-4">
    <section className="card card-pad">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-300"><BellRing className="h-5 w-5" /></span>
        <div>
          <h2 className="text-lg font-semibold">Monitore as melhores promoções</h2>
          <p className="text-sm text-muted">Receba um aviso assim que uma loja atingir os pontos ou cashback que você quer.</p>
        </div>
      </div>
      {props.suggestions.length > 0 && (
        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Zap className="h-4 w-4 text-amber-300" />Ative em um clique</p>
          <p className="mb-3 text-xs text-muted">Sugestões a partir das suas lojas favoritas e das mais usadas.</p>
          <ul className="grid gap-2 sm:grid-cols-2" aria-label="Sugestões de alerta">
            {props.suggestions.map((sg) => (
              <li key={sg.storeId} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{sg.name}</p>
                  <p className="text-xs text-muted">Avisa a partir de {sg.threshold}x em pontos.</p>
                </div>
                <button className="btn-ghost h-8" onClick={() => quick(sg)} disabled={activating === sg.storeId} aria-label={`Ativar alerta de ${sg.name}`}>Ativar</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={create} className="card card-pad space-y-4">
        <h2 className="text-lg font-semibold">Novo alerta</h2>
        {erro && <Alert>{erro}</Alert>}
        <Field label="Tipo" required>
          <select className="input" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="STORE_POINTS">Pontuação em loja</option>
            <option value="MIN_BALANCE">Saldo mínimo de conta</option>
          </select>
        </Field>
        {type === "STORE_POINTS" ? (
          <>
            <Field label="Loja" required><select className="input" name="storeId" required defaultValue=""><option value="" disabled>Selecione</option>{props.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Programa"><select className="input" name="programId"><option value="">Qualquer programa</option>{props.programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
            <Field label="Avisar a partir de (pts/R$)" required><input className="input" name="threshold" inputMode="decimal" required placeholder="10" /></Field>
          </>
        ) : (
          <>
            <Field label="Conta" required><select className="input" name="accountId" required defaultValue=""><option value="" disabled>Selecione</option>{props.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></Field>
            <Field label="Avisar quando o saldo ficar abaixo de (pontos)" required><input className="input" name="threshold" inputMode="numeric" required placeholder="5.000" /></Field>
          </>
        )}
        <button className="btn-primary w-full"><Bell className="h-4 w-4" />Criar alerta</button>
      </form>
      <section className="card overflow-hidden">
        <h2 className="border-b border-line px-5 py-4 text-lg font-semibold">Seus alertas</h2>
        {props.alerts.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">Nenhum alerta criado.</p> : (
          <ul className="divide-y divide-line">
            {props.alerts.map((a) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3.5">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${a.triggered ? "bg-green-500/15 text-green-300" : "bg-panel2 text-muted"}`} title={a.triggered ? "Disparado" : "Aguardando"}>
                  {a.triggered ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.title}</p>
                  <p className="truncate text-xs text-muted">{a.text}{a.triggered && " · disparado"}</p>
                </div>
                <button className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a.id, `${a.title}: ${a.text}`)} aria-label={`Excluir alerta ${a.title}`}><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
    </div>
  );
}
