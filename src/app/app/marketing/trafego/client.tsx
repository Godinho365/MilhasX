"use client";
// Tráfego: conectar o Meta (Facebook Login, só leitura), escolher até 3 contas de anúncios e ver o período por
// campanha, conjunto ou criativo: investimento, impressões, cliques, conversas, leads e os pedidos que chegaram pela
// página ligados a cada anúncio (pelos parâmetros de URL dos anúncios).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Facebook, RefreshCw, Unplug, Settings2, Copy, Search, TriangleAlert, Wallet, Eye, MousePointerClick, MessageCircle, UserPlus, ClipboardList,
  CalendarRange, Link2, KeyRound, ArrowUpDown,
} from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { Modal, Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { DateRangePicker, type DayRange } from "@/components/date-range";
import { META_URL_PARAMS, TRAFFIC_LEVELS, TRAFFIC_PERIODS, type TrafficLevel, type TrafficPeriod } from "@/domain/traffic";
import type { TrafficReportView, TrafficState } from "@/server/services/traffic";

type Props = {
  state: TrafficState; today: string; canEdit: boolean; owner: boolean;
  setup: { redirectUri: string; version: string };
  flash: { erro: string | null; conectado: number | null };
};
type SortKey = "spendCents" | "impressions" | "linkClicks" | "conversations" | "leads" | "orders";

const int = (n: number) => n.toLocaleString("pt-BR");
function money(cents: number | null, currency = "BRL") {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency });
}
const pct = (v: number | null) => (v == null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`);
const per = (cents: number, n: number) => (n > 0 ? Math.round(cents / n) : null);

export function TrafficClient({ state, today, canEdit, owner, setup, flash }: Props) {
  const c = state.connection;
  return (
    <div className="space-y-4">
      {flash.erro && <Alert>{flash.erro}</Alert>}
      {flash.conectado != null && <Alert kind="ok">Facebook conectado: {flash.conectado === 1 ? "1 conta de anúncios encontrada" : `${flash.conectado} contas de anúncios encontradas`}.</Alert>}
      {!state.enabled ? <SetupCard owner={owner} setup={setup} />
        : !c ? <ConnectCard canEdit={canEdit} />
        : <Connected state={state} today={today} canEdit={canEdit} />}
    </div>
  );
}

function Features() {
  return (
    <ul className="space-y-1 text-sm text-muted">
      <li>• Quanto você investiu e quantas pessoas viram e clicaram em cada campanha, conjunto e anúncio.</li>
      <li>• Conversas e leads que cada anúncio trouxe, lado a lado com o investimento.</li>
      <li>• Os pedidos de cotação que chegaram pela sua página, ligados ao anúncio de onde vieram.</li>
      <li>• Até 3 contas de anúncios. Só leitura: nada é publicado nem alterado nos seus anúncios.</li>
    </ul>
  );
}

function SetupCard({ owner, setup }: { owner: boolean; setup: Props["setup"] }) {
  return (
    <section className="card card-pad space-y-3">
      <h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-4 w-4 text-muted" />Falta configurar a conexão com o Meta</h2>
      <Features />
      {owner ? (
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Em <span className="font-medium">developers.facebook.com</span>, crie um app do tipo <span className="font-medium">Empresa</span> e adicione o produto <span className="font-medium">Login do Facebook para Empresas</span> (ou Login do Facebook).</li>
          <li>Em URIs de redirecionamento do OAuth válidos, cadastre: <code className="rounded bg-panel2 px-1.5 py-0.5 font-mono text-xs">{setup.redirectUri}</code></li>
          <li>Peça a permissão <span className="font-medium">ads_read</span> (para outras agências conectarem, ela precisa do acesso avançado, que passa pela análise do app no Meta).</li>
          <li>No servidor, coloque <code className="font-mono text-xs">META_APP_ID</code> e <code className="font-mono text-xs">META_APP_SECRET</code> no <code className="font-mono text-xs">.env</code> e reinicie o app. A versão usada é a {setup.version} (troca pela <code className="font-mono text-xs">META_GRAPH_VERSION</code>).</li>
        </ol>
      ) : <p className="text-sm text-muted">Fale com o dono da conta para configurar a conexão com o Meta.</p>}
    </section>
  );
}

function ConnectCard({ canEdit }: { canEdit: boolean }) {
  return (
    <section className="card card-pad space-y-3">
      <h2 className="font-semibold">Veja o resultado dos seus anúncios dentro do app</h2>
      <p className="text-sm text-muted">Conecte a sua conta do Facebook que administra os anúncios e acompanhe tudo aqui no painel de Tráfego.</p>
      <Features />
      {canEdit
        ? <a href="/api/traffic/meta/connect" className="btn-primary w-fit"><Facebook className="h-4 w-4" />Conectar com o Facebook</a>
        : <p className="text-sm text-muted">Peça a quem cuida do Marketing para conectar.</p>}
    </section>
  );
}

function Kpi({ icon, label, value, hint }: { icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="card card-pad">
      <div className="flex items-center gap-2"><p className="kicker">{label}</p><span className="ml-auto text-muted">{icon}</span></div>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Connected({ state, today, canEdit }: { state: TrafficState; today: string; canEdit: boolean }) {
  const router = useRouter();
  const c = state.connection!;
  const [period, setPeriod] = useState<TrafficPeriod>("30");
  const [custom, setCustom] = useState<DayRange>({ from: today, to: today });
  const [level, setLevel] = useState<TrafficLevel>("campaign");
  const [account, setAccount] = useState("");
  const [data, setData] = useState<TrafficReportView | null>(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("spendCents");
  const [picking, setPicking] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (c.status !== "OK" || !c.selected.length) return;
    setLoading(true);
    const qs = new URLSearchParams({ periodo: period, nivel: level });
    if (period === "custom" && custom) { qs.set("de", custom.from); qs.set("ate", custom.to); }
    if (account) qs.set("conta", account);
    if (refresh) qs.set("atualizar", "1");
    const r = await api<TrafficReportView>(`/api/traffic?${qs}`);
    setLoading(false);
    if (!r.ok) { setErro(r.erro); if (r.status === 409) refreshSafe(router); return; }
    setErro("");
    setData(r.data);
  }, [period, custom, level, account, c.status, c.selected.length, router]);
  useEffect(() => { void load(); }, [load]);

  async function disconnect() {
    if (!(await confirmDialog({ title: "Desconectar o Facebook?", body: "O painel para de mostrar os anúncios e a permissão do app é retirada. Os pedidos continuam com a origem guardada.", confirmLabel: "Desconectar", danger: true }))) return;
    const r = await api("/api/traffic/meta", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Facebook desconectado");
    refreshSafe(router);
  }

  const currency = data?.currencies.length === 1 ? data.currencies[0]! : "BRL";
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (data?.rows ?? []).filter((r) => !t || r.name.toLowerCase().includes(t) || r.campaignName.toLowerCase().includes(t) || (r.adsetName ?? "").toLowerCase().includes(t))
      .sort((a, b) => b[sort] - a[sort] || b.spendCents - a.spendCents);
  }, [data, q, sort]);
  const t = data?.totals;
  const names = new Map(c.accounts.map((a) => [a.id, a.name]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-panel2 px-3 py-1"><Facebook className="h-3.5 w-3.5 text-[#1877f2]" />{c.name}</span>
        <span className="text-muted">{c.selected.length ? c.selected.map((id) => names.get(id) ?? id).join(" · ") : "Nenhuma conta escolhida"}</span>
        <span className="flex-1" />
        {canEdit && <button type="button" className="btn-ghost h-9" onClick={() => setPicking(true)}><Settings2 className="h-4 w-4" />Contas</button>}
        {canEdit && <button type="button" className="btn-subtle h-9" onClick={() => void disconnect()}><Unplug className="h-4 w-4" />Desconectar</button>}
      </div>

      {c.status === "EXPIRED" ? (
        <Alert>A conexão com o Facebook venceu ou a permissão foi retirada. {canEdit ? <a href="/api/traffic/meta/connect" className="font-semibold underline">Conectar de novo</a> : "Peça a quem cuida do Marketing para conectar de novo."}</Alert>
      ) : !c.selected.length ? (
        <Empty title="Escolha as contas de anúncios" icon={<Settings2 className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">{c.accounts.length ? "Escolha até 3 contas para aparecer no painel." : "Essa conta do Facebook não tem contas de anúncios. Conecte com quem administra os anúncios."}</p>
          {canEdit && c.accounts.length > 0 && <button type="button" className="btn-primary" onClick={() => setPicking(true)}>Escolher contas</button>}
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Período">
              {TRAFFIC_PERIODS.map((p) => (
                <button key={p.key} type="button" role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${period === p.key ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{p.label}</button>
              ))}
              <button type="button" role="tab" aria-selected={period === "custom"} onClick={() => setPeriod("custom")} className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-medium ${period === "custom" ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}><CalendarRange className="h-3.5 w-3.5" />Personalizado</button>
            </div>
            {period === "custom" && <DateRangePicker value={custom} onChange={(r) => r && setCustom({ from: r.from, to: r.to > today ? today : r.to })} />}
            <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Nível">
              {(Object.keys(TRAFFIC_LEVELS) as TrafficLevel[]).map((l) => (
                <button key={l} type="button" role="tab" aria-selected={level === l} onClick={() => setLevel(l)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${level === l ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}>{TRAFFIC_LEVELS[l].label}</button>
              ))}
            </div>
            {c.selected.length > 1 && (
              <select className="input h-10 w-auto" value={account} onChange={(e) => setAccount(e.target.value)} aria-label="Conta de anúncios">
                <option value="">Todas as contas</option>
                {c.selected.map((id) => <option key={id} value={id}>{names.get(id) ?? id}</option>)}
              </select>
            )}
            <button type="button" className="btn-ghost h-10" disabled={loading} onClick={() => void load(true)}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />Atualizar</button>
          </div>
          <p className="text-xs text-muted">
            {data?.fetchedAt ? `Números do Meta de ${new Date(data.fetchedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })}. ` : ""}
            Os números de hoje podem estar incompletos: o Meta leva algumas horas para fechar o dia.
          </p>
          {erro && <Alert>{erro}</Alert>}
          {data && data.currencies.length > 1 && <Alert kind="info">As contas escolhidas usam moedas diferentes ({data.currencies.join(", ")}): veja uma conta de cada vez para somar valores na mesma moeda.</Alert>}

          {t && (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi icon={<Wallet className="h-4 w-4" />} label="Investido" value={money(t.spendCents, currency)} hint={t.cpmCents != null ? `${money(t.cpmCents, currency)} a cada mil impressões` : undefined} />
              <Kpi icon={<Eye className="h-4 w-4" />} label="Impressões" value={int(t.impressions)} hint={`CTR ${pct(t.ctr)}`} />
              <Kpi icon={<MousePointerClick className="h-4 w-4" />} label="Cliques no link" value={int(t.linkClicks)} hint={`CPC ${money(t.cpcCents, currency)}`} />
              <Kpi icon={<MessageCircle className="h-4 w-4" />} label="Conversas iniciadas" value={int(t.conversations)} hint={t.conversations ? `${money(t.costPerConversationCents, currency)} por conversa` : "WhatsApp, Messenger e Direct"} />
              <Kpi icon={<UserPlus className="h-4 w-4" />} label="Leads" value={int(t.leads)} hint={t.leads ? `${money(t.costPerLeadCents, currency)} por lead` : "Formulários e pixel"} />
              <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Pedidos dos anúncios" value={int(data!.orders.matched)} hint={data!.orders.matched ? `${money(t.costPerOrderCents, currency)} por pedido` : "Pedidos pela página ligados a um anúncio"} />
              <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Pedidos pela página" value={int(data!.orders.page)} hint={`${int(data!.orders.meta)} vieram do Meta`} />
              <Kpi icon={<MousePointerClick className="h-4 w-4" />} label="Cliques (todos)" value={int(t.clicks)} hint="Inclui curtidas, perfil e expandir" />
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar ${TRAFFIC_LEVELS[level].one}`} aria-label="Buscar" />
            </div>
            <label className="ml-auto inline-flex items-center gap-2 text-sm text-muted"><ArrowUpDown className="h-4 w-4" />
              <select className="input h-9 w-auto" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} aria-label="Ordenar por">
                <option value="spendCents">Mais investido</option><option value="impressions">Mais impressões</option><option value="linkClicks">Mais cliques</option>
                <option value="conversations">Mais conversas</option><option value="leads">Mais leads</option><option value="orders">Mais pedidos</option>
              </select>
            </label>
          </div>

          {data && rows.length === 0 ? (
            <Empty title={loading ? "Carregando..." : `Nenhum${level === "campaign" ? "a campanha" : level === "adset" ? " conjunto" : " anúncio"} com entrega no período`} icon={<Wallet className="h-5 w-5" />}>
              <p className="max-w-sm text-sm text-muted">Só aparece o que teve impressões no período escolhido.</p>
            </Empty>
          ) : data ? (
            <div className="card overflow-x-auto">
              <table className="table-base min-w-[960px]">
                <thead><tr>
                  <th className="text-left">{TRAFFIC_LEVELS[level].label}</th><th className="text-right">Investido</th><th className="text-right">Impressões</th><th className="text-right">Alcance</th>
                  <th className="text-right">Cliques</th><th className="text-right">CTR</th><th className="text-right">CPC</th><th className="text-right">Conversas</th><th className="text-right">Leads</th><th className="text-right">Pedidos</th><th className="text-right">Custo/pedido</th>
                </tr></thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.accountId}:${r.id}`}>
                      <td className="max-w-[320px]"><p className="truncate font-medium" title={r.name}>{r.name}</p><p className="truncate text-xs text-muted">{[level !== "campaign" ? r.campaignName : null, level === "ad" ? r.adsetName : null, c.selected.length > 1 ? names.get(r.accountId) : null].filter(Boolean).join(" · ") || `id ${r.id}`}</p></td>
                      <td className="text-right tabular-nums">{money(r.spendCents, currency)}</td>
                      <td className="text-right tabular-nums">{int(r.impressions)}</td>
                      <td className="text-right tabular-nums">{int(r.reach)}</td>
                      <td className="text-right tabular-nums">{int(r.linkClicks)}</td>
                      <td className="text-right tabular-nums">{pct(r.impressions ? Math.round((r.linkClicks / r.impressions) * 10_000) / 100 : null)}</td>
                      <td className="text-right tabular-nums">{money(per(r.spendCents, r.linkClicks), currency)}</td>
                      <td className="text-right tabular-nums">{int(r.conversations)}</td>
                      <td className="text-right tabular-nums">{int(r.leads)}</td>
                      <td className="text-right font-semibold tabular-nums">{int(r.orders)}</td>
                      <td className="text-right tabular-nums">{money(per(r.spendCents, r.orders), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : loading ? <p className="text-sm text-muted">Carregando os números do Meta...</p> : null}

          <LinkParams stats={data?.orders ?? null} />
        </>
      )}
      {picking && <AccountsDialog state={state} onClose={() => setPicking(false)} />}
    </div>
  );
}

function LinkParams({ stats }: { stats: { page: number; meta: number; matched: number } | null }) {
  const missing = stats && stats.meta > stats.matched;
  return (
    <section className="card card-pad space-y-2">
      <h2 className="flex items-center gap-2 font-semibold"><Link2 className="h-4 w-4 text-muted" />Ligue os pedidos aos anúncios</h2>
      <p className="text-sm text-muted">No Gerenciador de Anúncios, em cada anúncio, abra <span className="font-medium text-zinc-200">Rastreamento › Parâmetros de URL</span> e cole o texto abaixo. O pedido de cotação feito pela sua página chega com a campanha, o conjunto e o anúncio, e aparece na coluna Pedidos.</p>
      <div className="flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1 font-mono text-xs" readOnly value={META_URL_PARAMS} aria-label="Parâmetros de URL para os anúncios" onFocus={(e) => e.target.select()} />
        <button type="button" className="btn-ghost h-10" onClick={() => navigator.clipboard.writeText(META_URL_PARAMS).then(() => toast("Copiado"), () => null)}><Copy className="h-4 w-4" />Copiar</button>
      </div>
      {missing && <p className="flex items-start gap-1.5 text-xs text-amber-400"><TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />{stats!.meta - stats!.matched} pedido(s) vieram do Meta sem achar o anúncio: o anúncio está sem esses parâmetros ou é de uma conta que não está no painel.</p>}
    </section>
  );
}

function AccountsDialog({ state, onClose }: { state: TrafficState; onClose: () => void }) {
  const router = useRouter();
  const c = state.connection!;
  const [sel, setSel] = useState<string[]>(c.selected);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= 3 ? s : [...s, id]));
  async function save() {
    setBusy(true);
    const r = await api("/api/traffic/accounts", "PATCH", { selected: sel });
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast("Contas atualizadas");
    onClose();
    refreshSafe(router);
  }
  const STATUS: Record<number, string> = { 1: "Ativa", 2: "Desativada", 3: "Pagamento pendente", 7: "Em análise", 9: "Em período de carência", 101: "Encerrada" };
  return (
    <Modal open onClose={onClose} title="Contas de anúncios" size="sm"
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" disabled={busy} onClick={() => void save()}>Salvar</button></>}>
      <div className="space-y-2">
        {erro && <Alert>{erro}</Alert>}
        <p className="text-sm text-muted">Escolha até 3 contas para o painel ({sel.length}/3).</p>
        {c.accounts.length === 0 && <p className="text-sm text-muted">Nenhuma conta de anúncios nessa conta do Facebook.</p>}
        {c.accounts.map((a) => (
          <label key={a.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
            <input type="checkbox" className="checkbox" checked={sel.includes(a.id)} disabled={!sel.includes(a.id) && sel.length >= 3} onChange={() => toggle(a.id)} />
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{a.name}</span><span className="text-xs text-muted">{a.id.replace("act_", "")} · {a.currency} · {STATUS[a.status] ?? `situação ${a.status}`}</span></span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
