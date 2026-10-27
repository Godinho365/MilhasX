"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Star, Search, Coins, Wallet, Bell, BellRing, Trash2, Store as StoreIcon, Filter, Zap, ExternalLink } from "lucide-react";
import { useNav, refreshSafe } from "@/lib/nav";
import { Switch } from "@/components/form-parts";
import { api } from "@/lib/api";
import { colorFor } from "@/lib/colors";
import { DailyParity } from "@/components/charts";
import { Field, Alert, Empty, Modal } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";

type PointsOffer = { pointsPerReal: number; program: string; upTo: boolean; perDollar: boolean; club: number | null; regular: number | null; promotion: boolean; promoEndsAt: string | null; link: string | null; observedAt: string | null };
const ppr = (o: { pointsPerReal: number; upTo: boolean; perDollar: boolean }) => `${o.upTo ? "até " : ""}${o.pointsPerReal.toLocaleString("pt-BR")} pts/${o.perDollar ? "US$" : "R$"}`;

function StoreDetails({ store, onClose }: { store: Store; onClose: () => void }) {
  const [history, setHistory] = useState<{ day: string; program: string; value: number; max: number }[] | null>(null);
  useEffect(() => {
    api<{ items: { day: string; program: string; value: number; max: number }[] }>(`/api/stores/${store.id}/history`).then((r) => setHistory(r.ok ? r.data.items : []));
  }, [store.id]);
  return (
    <Modal open onClose={onClose} title={store.name}>
      <ul className="divide-y divide-line" aria-label="Pontos por programa">
        {store.programs.map((o) => (
          <li key={o.program} className="flex flex-wrap items-center gap-3 py-3">
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
            {o.link && <a href={o.link} target="_blank" rel="noopener noreferrer nofollow" className="btn-subtle h-8 px-2 text-xs">Regras<ExternalLink className="h-3.5 w-3.5" /></a>}
          </li>
        ))}
      </ul>
      <h3 className="mb-2 mt-4 text-sm font-semibold">Histórico (máximo de cada dia, 30 dias)</h3>
      {history === null ? <p className="py-10 text-center text-sm text-muted">Carregando…</p> : <DailyParity data={history} />}
    </Modal>
  );
}

type Store = { id: string; name: string; favorite: boolean; bestPoints: PointsOffer | null; programs: PointsOffer[]; bestCashback: { percent: number; portal: string } | null };

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

export function StoresGrid({ items }: { items: Store[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [details, setDetails] = useState<Store | null>(null);
  async function fav(s: Store) {
    setBusy(s.id);
    const r = await api<{ favorite: boolean }>(`/api/stores/${s.id}/favorite`, "POST");
    setBusy(null);
    if (!r.ok) return toast(r.erro, "error");
    toast(r.data.favorite ? `${s.name} nos favoritos` : `${s.name} removida dos favoritos`);
    refreshSafe(router);
  }
  if (items.length === 0) return <Empty title="Nenhuma loja encontrada" icon={<StoreIcon className="h-5 w-5" />} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {items.map((s) => {
        const c = colorFor(s.name);
        return (
          <article key={s.id} className="card p-5">
            <div className="mb-4 flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold" style={{ backgroundColor: `${c}22`, color: c }} aria-hidden>
                {s.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
              </span>
              <h3 className="min-w-0 flex-1 truncate font-semibold">{s.name}</h3>
              <button onClick={() => fav(s)} disabled={busy === s.id} aria-pressed={s.favorite} aria-label={s.favorite ? `Remover ${s.name} dos favoritos` : `Favoritar ${s.name}`} className="btn-subtle h-8 w-8 px-0">
                <Star className={`h-[18px] w-[18px] ${s.favorite ? "fill-amber-300 text-amber-300" : ""}`} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-line pt-4">
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500/15 text-blue-300"><Coins className="h-4 w-4" /></span>
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-muted">Pontos</p>
                  {s.bestPoints ? (
                    <>
                      <p className="truncate font-semibold">{s.bestPoints.upTo && <span className="text-xs font-normal text-muted">até </span>}{s.bestPoints.pointsPerReal.toLocaleString("pt-BR")} pts/{s.bestPoints.perDollar ? "US$" : "R$"}{s.bestPoints.regular != null && <span className="ml-1 text-xs font-normal text-muted line-through">{s.bestPoints.regular.toLocaleString("pt-BR")}</span>}</p>
                      <p className="truncate text-xs text-muted">{s.bestPoints.program}{s.bestPoints.club != null && <span className="text-accent-light"> · Clube {s.bestPoints.club.toLocaleString("pt-BR")}</span>}</p>
                      {s.bestPoints.promotion && <p className="mt-0.5 w-fit rounded bg-amber-500/15 px-1.5 text-[11px] font-medium text-amber-300">Promoção</p>}
                    </>
                  ) : <p className="text-muted">Sem oferta</p>}
                </div>
              </div>
              <div className="flex min-w-0 items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-500/15 text-green-300"><Wallet className="h-4 w-4" /></span>
                <div className="min-w-0 text-sm">
                  <p className="text-xs text-muted">Cashback</p>
                  {s.bestCashback ? <><p className="truncate font-semibold">{s.bestCashback.percent.toLocaleString("pt-BR")}%</p><p className="truncate text-xs text-muted">{s.bestCashback.portal}</p></> : <p className="text-muted">Sem oferta</p>}
                </div>
              </div>
            </div>
            {s.programs.length > 0 && (
              <button className="mt-4 w-full rounded-lg border border-line py-1.5 text-xs font-medium text-muted hover:bg-panel2 hover:text-zinc-100" onClick={() => setDetails(s)} aria-label={`Detalhes de ${s.name}`}>
                {s.programs.length > 1 ? `Ver ${s.programs.length} programas e histórico` : "Ver detalhes e histórico"}
              </button>
            )}
          </article>
        );
      })}
      {details && <StoreDetails store={details} onClose={() => setDetails(null)} />}
    </div>
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
