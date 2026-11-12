"use client";
// Chat Balcões, no formato de um mensageiro: à esquerda a lista de conversas (grupos de balcão, conversas no privado e
// os Alertas), com busca, filtro de não lidas e a última mensagem de cada uma; no centro a conversa aberta (recebidas à
// esquerda, enviadas à direita, contrapropostas embaixo do pedido); à direita os detalhes do pedido em foco. Em tela
// menor o painel de detalhes abre por cima e, no celular, a lista e a conversa se alternam. As mensagens chegam em
// tempo real (ou de tempos em tempos, sem ele); mensagem que dispara um alerta fica destacada e avisa. O app só manda
// o que o usuário escreveu e mandou.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Copy, Plus, Settings, Trash2, RefreshCw, Send, MessageCircle, X, Reply, CornerDownRight, Pencil, Check, Eraser, KanbanSquare, Handshake, Paperclip, Download, Users, Search, ArrowLeft, Info, ListFilter, ExternalLink, PlaneTakeoff, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDateTime, fmtPts, parseBRLToCents } from "@/lib/format";
import { Alert, Field } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { describeAlert, parseAlertWords, type AlertRule } from "@/domain/telegram-alerts";
import { BALCAO_PROGRAMS, emissionAnalysis, parseBalcaoAd, parseCounterOffer, type BalcaoAd, type EmissionAccount } from "@/domain/balcao-ads";
import { DEAL_STAGE_LABELS, type DealStageKey } from "@/domain/miles-deals";
import { reportLatency, useRealtimeConnection, useRealtimeEvents, type RtEvent, type RtState } from "@/lib/realtime";
import { openEntryForm } from "@/components/entry-forms";

type Chat = { id: string; title: string; account: string; clearedUpTo?: number | null };
/** O pedido a que você mandou a contraproposta no privado (a conversa fica ligada a ele). */
type DmOffer = { chatId: string; messageId: number; text: string; sender: string; group: string; cpmCents: number | null; at: string };
export type Dm = { id: string; linkId: string; name: string; username: string | null; via: string; group: string | null; clearedUpTo?: number | null; offer?: DmOffer | null; crm?: CrmRef | null };
type Unread = { id: string; unread: number; reopened: boolean; last: { id: number; text: string; date: string } | null; dm: Dm };
type CrmRef = { id: string; number: number; stage: string; accountId: string | null };
/** origin: o pedido encaminhado no privado veio desta mensagem do grupo; group: contraproposta de outro membro no
 *  grupo, mostrada embaixo do pedido no privado. */
type Msg = { id: number; date: string; sender: string; text: string; media: string | null; mediaKind?: "photo" | "file" | null; mediaName?: string | null; out: boolean; fromUser: boolean; replyTo: number | null; fwd?: boolean; ad: BalcaoAd | null; alerts: string[]; crm?: CrmRef | null; origin?: { chatId: string; messageId: number } | null; group?: boolean };
type FeedMsg = Msg & { chatId: string; chat: string };
/** Última mensagem de uma conversa (para a lista). */
type Preview = { text: string; date: string; sender: string; out: boolean; media: string | null; ad: BalcaoAd | null };
/** O que a aba mostra: o grupo do balcão de uma conta ou uma conversa no privado. */
type Source = { kind: "group"; chat: Chat } | { kind: "dm"; dm: Dm };

const CHAT_POLL_MS = 15_000;
const FEED_POLL_MS = 30_000;
const UNREAD_POLL_MS = 20_000;
/** Com o tempo real conectado, as buscas periódicas viram só rede de segurança. */
const SAFETY_POLL_MS = 60_000;
const ALERTS_TAB = "alertas";
const dmKey = (id: string) => `dm:${id}`;
/** id da mensagem na página (para rolar até ela): o chat (pela url) e o número da mensagem. */
const msgDomId = (url: string, id: number) => `msg-${url.split("/").slice(-2, -1)[0]}-${id}`;
const ALERTS_SEEN_KEY = "chat-balcoes:alertas-vistos"; // até quando a aba Alertas foi vista (data da mensagem)

/** Bolinha com a quantidade de não vistas na aba (100 ou mais = 99+). */
function Badge({ n, tone = "accent" }: { n: number; tone?: "accent" | "amber" }) {
  if (n <= 0) return null;
  return <span className={`rounded-full px-1.5 text-[11px] font-bold ${tone === "amber" ? "bg-amber-500 text-black" : "bg-accent-light text-zinc-950"}`} aria-label={`${n} não vistas`}>{n > 99 ? "99+" : n}</span>;
}
function readAlertsSeen() {
  try { return localStorage.getItem(ALERTS_SEEN_KEY); } catch { return null; }
}
function writeAlertsSeen(iso: string) {
  try { localStorage.setItem(ALERTS_SEEN_KEY, iso); } catch { /* sem armazenamento: vale só nesta tela */ }
}

/** Milhas digitadas: "100k", "100.000" ou "100000"; vazio = null; inválido = undefined. */
function milesInput(raw: string): number | null | undefined {
  const t = raw.trim().toLowerCase().replace(/\s/g, "");
  if (!t) return null;
  const k = t.match(/^(\d+(?:[.,]\d+)?)k$/);
  if (k) return Math.round(Number(k[1]!.replace(",", ".")) * 1000);
  return /^\d{1,3}(\.\d{3})*$|^\d+$/.test(t) ? Number(t.replace(/\./g, "")) : undefined;
}

/** Resumo da mensagem para citar (na resposta e no "Respondendo a"): o pedido lido ou o começo do texto. */
function quote(m: Msg) {
  if (m.ad) return `${m.ad.program} · ${fmtPts(m.ad.miles)} milhas · ${m.ad.cpfs ?? 1} ${(m.ad.cpfs ?? 1) === 1 ? "CPF" : "CPFs"} · ${m.ad.cpmCents != null ? fmtBRL(m.ad.cpmCents) : "sem preço"}`;
  const t = m.text.replace(/\s+/g, " ").trim();
  return t ? (t.length > 80 ? `${t.slice(0, 80)}…` : t) : m.media ? `[${m.media}]` : "mensagem";
}

/** Hora da mensagem: só a hora se for de hoje; senão, dia e hora (Brasília). */
function when(iso: string) {
  const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const d = new Date(iso);
  return day(d) === day(new Date()) ? d.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : fmtDateTime(d);
}
/** Dia para o separador da conversa: Hoje, Ontem ou a data (Brasília). */
function dayLabel(iso: string) {
  const day = (d: Date) => d.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const d = day(new Date(iso));
  if (d === day(new Date())) return "Hoje";
  if (d === day(new Date(Date.now() - 86_400_000))) return "Ontem";
  return d;
}
/** Hora curta para a lista de conversas: hora se for hoje, "Ontem" ou a data. */
function listTime(iso: string) {
  const l = dayLabel(iso);
  return l === "Hoje" ? new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : l === "Ontem" ? l : l.slice(0, 5);
}
/** O pedido numa linha: "LATAM · 36.000 milhas · 2 CPFs · R$ 26,50/milheiro". */
function adLine(ad: BalcaoAd, cpmCents = ad.cpmCents) {
  const cpfs = ad.cpfs ?? 1;
  return `${ad.program} · ${fmtPts(ad.miles)} milhas · ${cpfs} ${cpfs === 1 ? "CPF" : "CPFs"} · ${cpmCents != null ? `${fmtBRL(cpmCents)}/milheiro` : "sem preço"}`;
}

const AVATAR_TONES = ["bg-blue-500/20 text-blue-300", "bg-emerald-500/20 text-emerald-300", "bg-violet-500/20 text-violet-300", "bg-amber-500/20 text-amber-300", "bg-sky-500/20 text-sky-300", "bg-fuchsia-500/20 text-fuchsia-300"];
/** Avatar: grupo (ícone), alertas (sino) ou pessoa (iniciais, cor fixa pelo nome). */
function Avatar({ kind, name, size = "md" }: { kind: "group" | "dm" | "alerts"; name: string; size?: "sm" | "md" | "lg" }) {
  const dim = size === "sm" ? "h-8 w-8 text-xs" : size === "lg" ? "h-11 w-11 text-sm" : "h-10 w-10 text-sm";
  const icon = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  if (kind === "group") return <span className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-light`} aria-hidden><Users className={icon} /></span>;
  if (kind === "alerts") return <span className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-300`} aria-hidden><Bell className={icon} /></span>;
  const clean = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim();
  const initials = clean.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("") || "?";
  const tone = AVATAR_TONES[[...name].reduce((t, c) => t + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return <span className={`flex ${dim} shrink-0 items-center justify-center rounded-full font-semibold ${tone}`} aria-hidden>{initials}</span>;
}

/** Repete a cada `ms` enquanto a aba do navegador estiver visível (e logo ao voltar para ela). */
function usePolling(fn: () => void, ms: number, on = true) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!on) return;
    const tick = () => { if (document.visibilityState === "visible") ref.current(); };
    const t = setInterval(tick, ms);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [ms, on]);
}

export function ChatBalcoesClient({ chats, initialAlerts, initialDms, accounts = [], openDmId = null, realtime = false }: { chats: Chat[]; initialAlerts: AlertRule[]; initialDms: Dm[]; accounts?: EmissionAccount[]; openDmId?: string | null; realtime?: boolean }) {
  // tempo real: as mensagens chegam pelo WebSocket; sem ele (desligado ou caído), as buscas de 15/20/30 s seguem
  const rt = useRealtimeConnection(realtime);
  const live = rt.state === "live";
  // abre direto na conversa pedida (vinda do CRM Milhas) ou no primeiro grupo
  const [tab, setTab] = useState(openDmId ? `dm:${openDmId}` : chats[0]!.id);
  // mensagem a mostrar no chat (vinda da aba Alertas ou do privado): o chat rola até ela e a destaca; reply = já abre
  // a contraproposta para ela; n = cada clique
  const [focus, setFocus] = useState<{ chatId: string; id: number; n: number; reply: boolean } | null>(null);
  function negotiate(chatId: string, id: number) {
    setTab(chatId);
    setFocus({ chatId, id, n: Date.now(), reply: true });
  }
  /** Do privado: vai para o pedido na aba do grupo de onde ele veio. */
  function goToGroup(chatId: string, id: number) {
    if (!chats.some((c) => c.id === chatId)) return toast("O grupo deste pedido não está mais no Chat Balcões", "error");
    setTab(chatId);
    setFocus({ chatId, id, n: Date.now(), reply: false });
  }
  const [dms, setDms] = useState(initialDms);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [feed, setFeed] = useState<FeedMsg[] | null>(null);
  const [feedErrors, setFeedErrors] = useState<{ chat: string; erro: string }[]>([]);
  const [alertsSeenAt, setAlertsSeenAt] = useState<string | null>(null); // alertas vistos até esta data
  const seen = useRef<Set<string> | null>(null); // mensagens com alerta já vistas (para avisar só das novas)
  const active = alerts.some((a) => a.active);

  const loadFeed = useCallback(async () => {
    const r = await api<{ items: FeedMsg[]; errors: { chat: string; erro: string }[] }>("/api/telegram/alerts/feed");
    if (!r.ok) return;
    setFeed(r.data.items);
    setFeedErrors(r.data.errors);
    const keys = r.data.items.map((m) => `${m.chatId}:${m.id}`);
    if (!seen.current) { seen.current = new Set(keys); return; } // a primeira leitura não avisa (já estavam lá)
    const fresh = r.data.items.filter((m) => !seen.current!.has(`${m.chatId}:${m.id}`));
    for (const k of keys) seen.current.add(k);
    if (!fresh.length) return;
    for (const m of fresh.slice(0, 3)) {
      toast(`Alerta ${m.alerts.join(", ")} em ${m.chat}`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`Alerta: ${m.alerts.join(", ")} · ${m.chat}`, { body: `${m.sender}: ${m.text.slice(0, 140)}`, tag: `${m.chatId}:${m.id}` });
    }
  }, []);
  // alertas mudaram: a próxima leitura vira a base (as mensagens antigas que passam a combinar não são avisadas)
  useEffect(() => {
    seen.current = null;
    if (active) void loadFeed();
  }, [active, alerts, loadFeed]);
  usePolling(loadFeed, live ? SAFETY_POLL_MS : FEED_POLL_MS, active);
  // não vistos dos alertas: os que chegaram depois da última vez que a aba foi aberta (fica guardado no navegador)
  const newestAlert = feed?.[0]?.date ?? null;
  useEffect(() => {
    if (!newestAlert) return;
    const stored = alertsSeenAt ?? readAlertsSeen();
    // primeira vez: começa do zero; com a aba Alertas aberta, o que chega já conta como visto
    const next = !stored || tab === ALERTS_TAB ? (stored && stored > newestAlert ? stored : newestAlert) : stored;
    if (next !== alertsSeenAt) setAlertsSeenAt(next);
    if (next !== stored) writeAlertsSeen(next);
  }, [newestAlert, tab, alertsSeenAt]);
  const unseenAlerts = feed && alertsSeenAt ? feed.filter((m) => m.date > alertsSeenAt).length : 0;

  // não vistas em cada aba (grupo e privado, pela chave da aba); quem responde a sua contraproposta ganha a aba de
  // volta sozinho
  const [unread, setUnread] = useState<Record<string, number>>({});
  const [previews, setPreviews] = useState<{ groups: Record<string, Preview>; dms: Record<string, Preview> }>({ groups: {}, dms: {} });
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const loadUnread = useCallback(async () => {
    void api<{ groups: Record<string, Preview>; dms: Record<string, Preview> }>("/api/telegram/previews").then((p) => { if (p.ok) setPreviews({ groups: p.data.groups, dms: p.data.dms }); });
    const r = await api<{ items: Unread[]; groups: { id: string; unread: number }[] }>("/api/telegram/dms/unread");
    if (!r.ok) return;
    const open = r.data.items.filter((u) => u.unread > 0);
    setDms((cur) => {
      const add = open.filter((u) => !cur.some((d) => d.id === u.id)).map((u) => u.dm);
      return add.length ? [...cur, ...add] : cur;
    });
    // a aba aberta na tela se marca como vista sozinha
    const counts: [string, number][] = [...r.data.items.map((u) => [dmKey(u.id), u.unread] as [string, number]), ...r.data.groups.map((g) => [g.id, g.unread] as [string, number])];
    setUnread(Object.fromEntries(counts.map(([k, n]) => [k, tabRef.current === k ? 0 : n])));
    for (const u of open.filter((x) => x.reopened).slice(0, 3)) {
      toast(`${u.dm.name} respondeu a sua contraproposta`);
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`${u.dm.name} respondeu no privado`, { body: u.last?.text.slice(0, 140) ?? "", tag: `dm:${u.id}:${u.last?.id ?? 0}` });
    }
  }, []);
  useEffect(() => { void loadUnread(); }, [loadUnread]);
  usePolling(loadUnread, live ? SAFETY_POLL_MS : UNREAD_POLL_MS);
  // evento em tempo real: contadores e alertas na hora (vários eventos juntos viram uma busca só)
  const soon = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const debounce = (key: string, ms: number, fn: () => void) => {
    clearTimeout(soon.current[key]);
    soon.current[key] = setTimeout(fn, ms);
  };
  useRealtimeEvents(realtime, (e) => {
    if (e.type === "resync") { void loadUnread(); if (active) void loadFeed(); return; }
    if (!e.type.startsWith("message.")) return;
    if (e.type !== "message.edit") debounce("unread", 250, () => void loadUnread());
    if (active && e.chatKind === "GROUP" && e.type !== "message.delete") debounce("feed", 400, () => void loadFeed());
  });
  /** A aba (grupo ou privado) foi vista na tela até a mensagem upTo. */
  const seenAt = useRef<Record<string, number>>({});
  const markSeen = useCallback((key: string, url: string, upTo: number) => {
    setUnread((u) => (u[key] ? { ...u, [key]: 0 } : u));
    if ((seenAt.current[key] ?? 0) >= upTo) return;
    seenAt.current[key] = upTo;
    void api(url, "POST", { upTo });
  }, []);
  /** Contraproposta mandada também no privado: a conversa aparece na barra (sem trocar de aba). */
  const offerDm = useCallback((dm: Dm) => setDms((cur) => (cur.some((d) => d.id === dm.id) ? cur.map((d) => (d.id === dm.id ? dm : d)) : [...cur, dm])), []);

  /** Chamar no privado quem mandou a mensagem do grupo: abre (ou volta para) a aba da conversa. */
  async function openDm(chatId: string, messageId: number) {
    const r = await api<{ item: Dm }>(`/api/telegram/chats/${chatId}/dms`, "POST", { messageId });
    if (!r.ok) return toast(r.erro, "error");
    const dm = r.data.item;
    setDms((cur) => (cur.some((d) => d.id === dm.id) ? cur : [...cur, dm]));
    setTab(dmKey(dm.id));
  }
  async function closeDm(dm: Dm) {
    const r = await api(`/api/telegram/dms/${dm.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    setDms((cur) => cur.filter((d) => d.id !== dm.id));
    if (tab === dmKey(dm.id)) setTab(chats[0]!.id);
  }

  // lista de conversas: busca, filtro de não lidas e a ordem pela mensagem mais recente
  const [query, setQuery] = useState("");
  const [onlyUnread, setOnlyUnread] = useState(false);
  // celular: a lista ou a conversa (a partir de md as duas aparecem lado a lado)
  const [mobileChat, setMobileChat] = useState(!!openDmId);
  // painel de detalhes: aberto ao lado em tela larga; em tela menor abre por cima e começa fechado
  const [panel, setPanel] = useState(false);
  useEffect(() => { if (window.matchMedia("(min-width: 1536px)").matches) setPanel(true); }, []);
  function open(key: string) {
    setTab(key);
    setMobileChat(true);
  }
  type Entry = { key: string; kind: "group" | "dm"; name: string; sub: string; preview?: Preview; unread: number; dm?: Dm };
  const entries: Entry[] = [
    ...chats.map((c) => ({ key: c.id, kind: "group" as const, name: c.title, sub: `Grupo · ${c.account}`, preview: previews.groups[c.id], unread: tab === c.id ? 0 : unread[c.id] ?? 0 })),
    ...dms.map((d) => ({ key: dmKey(d.id), kind: "dm" as const, name: d.name, sub: d.group ? `Privado · do grupo ${d.group}` : "Privado", preview: previews.dms[d.id], unread: tab === dmKey(d.id) ? 0 : unread[dmKey(d.id)] ?? 0, dm: d })),
  ].sort((a, b) => (b.preview?.date ?? "").localeCompare(a.preview?.date ?? ""));
  const q = query.trim().toLowerCase();
  const unreadCount = entries.filter((e) => e.unread > 0).length + (unseenAlerts > 0 ? 1 : 0);
  const shownEntries = entries.filter((e) => (!q || e.name.toLowerCase().includes(q)) && (!onlyUnread || e.unread > 0));
  const showAlerts = (!q || "alertas".includes(q)) && (!onlyUnread || unseenAlerts > 0);
  const previewText = (p?: Preview) => {
    if (!p) return "Sem mensagens recentes";
    const body = p.ad ? `${p.ad.kind === "COMPRA" ? "Compra" : "Venda"} ${adLine(p.ad)}` : p.text || (p.media ? `[${p.media}]` : "mensagem");
    return `${p.out ? "Você" : p.sender}: ${body}`;
  };

  return (
    <div className="card flex h-[calc(100dvh-8.5rem)] min-h-[520px] overflow-hidden">
      {/* lista de conversas */}
      <aside className={`${mobileChat ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-line md:w-[300px] lg:w-[320px]`} aria-label="Conversas">
        <div className="space-y-3 border-b border-line p-3 sm:p-4">
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-semibold">Chat Balcões</h1>
              <LiveBadge realtime={realtime} state={rt.state} links={rt.links} />
            </div>
            <Link href="/app/settings?tab=telegram" className="btn-subtle h-9 w-9 shrink-0 px-0" aria-label="Contas e grupos do Telegram" title="Contas e grupos do Telegram"><Settings className="h-4 w-4" /></Link>
          </div>
          <label className="relative block">
            <span className="sr-only">Buscar conversas</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar conversas" className="input rounded-full pl-9" />
          </label>
          <div className="flex gap-1.5" role="group" aria-label="Filtrar conversas">
            <button type="button" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)} className={`rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light ${!onlyUnread ? "bg-accent-soft text-accent-light" : "text-muted hover:bg-panel2 hover:text-zinc-100"}`}>Todas</button>
            <button type="button" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light ${onlyUnread ? "bg-accent-soft text-accent-light" : "text-muted hover:bg-panel2 hover:text-zinc-100"}`}>
              Não lidas{unreadCount > 0 && <Badge n={unreadCount} />}
            </button>
          </div>
        </div>
        <ul className="flex-1 overflow-y-auto p-1.5" aria-label="Lista de conversas">
          {showAlerts && (
            <li>
              <button type="button" onClick={() => open(ALERTS_TAB)} aria-current={tab === ALERTS_TAB ? "true" : undefined} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light ${tab === ALERTS_TAB ? "bg-accent-soft" : "hover:bg-panel2"}`}>
                <Avatar kind="alerts" name="Alertas" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2"><span className={`truncate ${unseenAlerts ? "font-semibold text-zinc-50" : "font-medium"}`}>Alertas</span></span>
                  <span className="block truncate text-sm text-muted">{alerts.filter((a) => a.active).length} {alerts.filter((a) => a.active).length === 1 ? "alerta ativo" : "alertas ativos"}{feed?.[0] ? ` · último: ${feed[0].chat}` : ""}</span>
                </span>
                <Badge n={tab === ALERTS_TAB ? 0 : unseenAlerts} tone="amber" />
              </button>
            </li>
          )}
          {shownEntries.map((e) => (
            <li key={e.key} className="group/item relative">
              <button type="button" onClick={() => open(e.key)} aria-current={tab === e.key ? "true" : undefined} title={e.sub} className={`flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light ${tab === e.key ? "bg-accent-soft" : "hover:bg-panel2"} ${e.dm ? "pr-9" : ""}`}>
                <Avatar kind={e.kind} name={e.name} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={`min-w-0 flex-1 truncate ${e.unread ? "font-semibold text-zinc-50" : "font-medium"}`}>{e.name}</span>
                    {e.preview && <span className={`shrink-0 text-xs ${e.unread ? "font-semibold text-accent-light" : "text-muted"}`}>{listTime(e.preview.date)}</span>}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-sm ${e.unread ? "text-zinc-200" : "text-muted"}`}>{previewText(e.preview)}</span>
                    <Badge n={e.unread} />
                  </span>
                </span>
              </button>
              {e.dm && (
                <button type="button" onClick={() => closeDm(e.dm!)} className="absolute right-2 top-2 rounded-full p-1 text-muted opacity-0 hover:bg-panel hover:text-zinc-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light group-hover/item:opacity-100 [@media(hover:none)]:opacity-100" aria-label={`Fechar a conversa com ${e.name}`} title="Fechar aqui (no Telegram a conversa continua)"><X className="h-3.5 w-3.5" /></button>
              )}
            </li>
          ))}
          {!shownEntries.length && !showAlerts && <li className="px-3 py-6 text-center text-sm text-muted">{onlyUnread ? "Nenhuma conversa com mensagens não lidas." : "Nenhuma conversa encontrada."}</li>}
        </ul>
      </aside>

      {/* conversa aberta (todas ficam montadas: trocar de conversa não perde o que já carregou) */}
      <section className={`${mobileChat ? "flex" : "hidden md:flex"} min-w-0 flex-1`} aria-label="Conversa">
        {chats.map((c) => <div key={c.id} className={tab === c.id ? "flex min-w-0 flex-1" : "hidden"}><ChatView source={{ kind: "group", chat: c }} visible={tab === c.id} onDm={(id) => openDm(c.id, id)} onOfferDm={offerDm} onSeen={(upTo) => markSeen(c.id, `/api/telegram/chats/${c.id}/seen`, upTo)} focus={focus?.chatId === c.id ? focus : null} accounts={accounts} realtime={realtime} live={live} onBack={() => setMobileChat(false)} panel={panel} setPanel={setPanel} /></div>)}
        {dms.map((d) => <div key={d.id} className={tab === dmKey(d.id) ? "flex min-w-0 flex-1" : "hidden"}><ChatView source={{ kind: "dm", dm: d }} visible={tab === dmKey(d.id)} onSeen={(upTo) => markSeen(dmKey(d.id), `/api/telegram/dms/${d.id}/seen`, upTo)} onGoToGroup={goToGroup} accounts={accounts} realtime={realtime} live={live} onBack={() => setMobileChat(false)} panel={panel} setPanel={setPanel} /></div>)}
        {tab === ALERTS_TAB && (
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-line px-3 py-2.5 sm:px-4">
              <button type="button" onClick={() => setMobileChat(false)} className="btn-subtle h-9 w-9 shrink-0 px-0 md:hidden" aria-label="Voltar para as conversas"><ArrowLeft className="h-5 w-5" /></button>
              <Avatar kind="alerts" name="Alertas" />
              <div className="min-w-0 flex-1">
                <h2 className="truncate font-semibold">Alertas</h2>
                <p className="truncate text-xs text-muted">As mensagens de todos os grupos que combinam com os seus alertas</p>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-3 sm:p-4">
              <AlertsTab alerts={alerts} setAlerts={setAlerts} feed={feed} errors={feedErrors} chats={chats} openChat={open} reload={loadFeed} accounts={accounts} onNegotiate={(chatId, id) => { negotiate(chatId, id); setMobileChat(true); }} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/** Como as mensagens estão chegando: em tempo real, reconectando, ou buscadas de 15 em 15 s (tempo real desligado). */
function LiveBadge({ realtime, state, links }: { realtime: boolean; state: RtState; links: Record<string, string> }) {
  const states = Object.values(links);
  const revoked = states.filter((x) => x === "revoked").length;
  const down = states.filter((x) => x === "backoff" || x === "starting").length;
  const [tone, label, hint] = !realtime
    ? ["bg-zinc-500", "A cada 15 s", "As mensagens são buscadas no Telegram de 15 em 15 segundos"]
    : state !== "live"
      ? ["bg-amber-400 animate-pulse", state === "connecting" ? "Conectando…" : "Reconectando…", "Sem a conexão em tempo real agora: as mensagens são buscadas de 15 em 15 segundos até ela voltar"]
      : revoked
        ? ["bg-red-500", "Telegram desconectado", `${revoked} ${revoked === 1 ? "conta saiu" : "contas saíram"} do Telegram: conecte de novo em Contas`]
        : down
          ? ["bg-amber-400 animate-pulse", "Telegram reconectando", `${down} ${down === 1 ? "conta do Telegram está" : "contas do Telegram estão"} reconectando; o que chegar nesse meio tempo é recuperado`]
          : ["bg-emerald-400", "Tempo real", "Conectado: as mensagens dos grupos e do privado aparecem na hora"];
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted" title={hint} role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden />{label}
    </span>
  );
}

/** Mensagens de um grupo ou de uma conversa no privado: carrega as últimas e depois só as novas (de 15 em 15
 *  segundos, com a aba aberta), com o campo para mandar mensagem embaixo. No grupo, cada pedido mostra o lucro de
 *  atendê-lo pela sua conta mais barata que consegue emitir (sem conta com saldo, não mostra). */
function ChatView({ source, visible, onDm, onOfferDm, onSeen, onGoToGroup, focus, accounts = [], realtime = false, live = false, onBack, panel = false, setPanel }: { source: Source; visible: boolean; onDm?: (messageId: number) => Promise<void>; onOfferDm?: (dm: Dm) => void; onSeen?: (upTo: number) => void; onGoToGroup?: (chatId: string, messageId: number) => void; focus?: { id: number; n: number; reply?: boolean } | null; accounts?: EmissionAccount[]; realtime?: boolean; live?: boolean; onBack?: () => void; panel?: boolean; setPanel?: (open: boolean) => void }) {
  const group = source.kind === "group";
  const url = group ? `/api/telegram/chats/${source.chat.id}/messages` : `/api/telegram/dms/${source.dm.id}/messages`;
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [readMax, setReadMax] = useState(0); // privado: até onde a pessoa já leu as suas mensagens (1 check verde)
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [onlyAds, setOnlyAds] = useState(group); // grupo: só os pedidos (esconde contrapropostas e conversa)
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const [replying, setReplying] = useState<Msg | null>(null); // a mensagem que vai ser respondida (contraproposta)
  const [editing, setEditing] = useState<Msg | null>(null); // a sua mensagem que está sendo editada
  const [alsoPrivate, setAlsoPrivate] = useState(true); // contraproposta: mandar também no privado do autor
  // limpo só no app até esta mensagem (no Telegram nada muda)
  const [cleared, setCleared] = useState<number | null>((group ? source.chat.clearedUpTo : source.dm.clearedUpTo) ?? null);
  const clearUrl = group ? `/api/telegram/chats/${source.chat.id}/clear` : `/api/telegram/dms/${source.dm.id}/clear`;
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  // envia uma foto, print ou PDF no chat (privado ou grupo); imagem vai como foto, PDF como documento
  async function sendAttachment(f: File) {
    if (f.size > 10 * 1024 * 1024) return toast("O arquivo passa de 10 MB", "error");
    setUploading(true);
    const res = await fetch(url.replace(/\/messages$/, "/file"), { method: "POST", body: f, headers: { "content-type": f.type || "application/octet-stream", "x-file-name": encodeURIComponent(f.name) } });
    const j = await res.json().catch(() => ({}));
    setUploading(false);
    if (!res.ok) return toast(j.erro ?? "Não deu para enviar o arquivo", "error");
    toast("Arquivo enviado");
    void load();
  }
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // rolando junto com as mensagens novas (o usuário não subiu para ler as antigas)
  // contrapropostas (respostas que não são pedido) agrupadas embaixo do pedido respondido
  const offers = new Map<number, Msg[]>();
  for (const m of msgs ?? []) if (m.replyTo && !m.ad) offers.set(m.replyTo, [...(offers.get(m.replyTo) ?? []), m]);
  // privado: as contrapropostas dos outros membros ao pedido no grupo de onde ele veio (as suas lá ficam de fora: a
  // do privado já aparece)
  const [groupMsgs, setGroupMsgs] = useState<Record<string, Msg[]>>({});
  const groupOffers = (o: { chatId: string; messageId: number }) => (groupMsgs[o.chatId] ?? []).filter((g) => g.replyTo === o.messageId && !g.ad && !g.out).map((g) => ({ ...g, group: true }));
  const offersOf = (m: Msg) => (m.origin ? [...(offers.get(m.id) ?? []), ...groupOffers(m.origin)] : offers.get(m.id));
  const adIds = new Set((msgs ?? []).filter((m) => m.ad).map((m) => m.id));
  // só pedidos: os pedidos e as suas mensagens soltas (a sua contraproposta aparece embaixo do pedido)
  const shown = msgs && onlyAds ? msgs.filter((m) => m.ad || (m.out && !(m.replyTo && adIds.has(m.replyTo)))) : msgs;
  const byId = new Map((msgs ?? []).map((m) => [m.id, m]));
  // privado: a sua contraproposta mais nova ao pedido encaminhado (nova ou editada) vale para a faixa do pedido
  // (a resposta ao pedido ou um valor curto solto depois dele, como "26")
  const fwdAd = (msgs ?? []).find((m) => m.fwd && m.ad);
  const liveOffer = fwdAd ? (msgs ?? []).filter((m) => m.out && !m.fwd && m.id > fwdAd.id && ((m.replyTo && byId.get(m.replyTo)?.ad) || m.text.trim().length <= 12)).map((m) => parseCounterOffer(m.text)).filter((c) => c != null).at(-1) ?? null : null;

  const load = useCallback(async () => {
    const last = msgs?.at(-1)?.id;
    setLoading(true);
    const r = await api<{ items: Msg[]; readMax?: number }>(`${url}?limit=100${last ? `&minId=${last}` : ""}`);
    setLoading(false);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    if (r.data.readMax != null) setReadMax(r.data.readMax); // atualiza a cada ciclo (mensagens antigas também viram "lidas")
    if (!last) return setMsgs(r.data.items);
    if (r.data.items.length) setMsgs((cur) => [...(cur ?? []), ...r.data.items.filter((m) => m.id > last && !(cur ?? []).some((x) => x.id === m.id))]);
  }, [url, msgs]);

  useEffect(() => { if (visible && msgs === null) void load(); }, [visible, msgs, load]);
  usePolling(() => { if (msgs !== null) void load(); }, live ? SAFETY_POLL_MS : CHAT_POLL_MS, visible);
  // privado: lê os grupos de onde vieram os pedidos encaminhados (as últimas mensagens, depois só as novas), para as
  // contrapropostas dos outros
  const originChats = [...new Set((msgs ?? []).flatMap((m) => (m.origin ? [m.origin.chatId] : [])))].sort().join(",");
  const groupMsgsRef = useRef(groupMsgs);
  groupMsgsRef.current = groupMsgs;
  const loadGroups = useCallback(async () => {
    for (const chatId of originChats ? originChats.split(",") : []) {
      const last = groupMsgsRef.current[chatId]?.at(-1)?.id;
      const r = await api<{ items: Msg[] }>(`/api/telegram/chats/${chatId}/messages?limit=100${last ? `&minId=${last}` : ""}`);
      if (!r.ok) continue; // grupo tirado do Chat Balcões ou fora do ar: fica sem as dos outros
      setGroupMsgs((cur) => {
        const have = cur[chatId] ?? [];
        const add = r.data.items.filter((m) => !have.some((x) => x.id === m.id));
        return add.length || !cur[chatId] ? { ...cur, [chatId]: [...have, ...add] } : cur;
      });
    }
  }, [originChats]);
  useEffect(() => { if (visible && originChats) void loadGroups(); }, [visible, originChats, loadGroups]);
  usePolling(() => { if (originChats) void loadGroups(); }, live ? SAFETY_POLL_MS : CHAT_POLL_MS, visible && !group);

  // tempo real: mensagem nova busca as novas (no banco, rápido); editada relê só ela; apagada sai da tela; leitura
  // no privado acende os checks. Mensagens que chegam assim ficam destacadas por um instante.
  const chatKind = group ? "GROUP" : "DM";
  const chatId = group ? source.chat.id : source.dm.id;
  const [fresh, setFresh] = useState<Set<number>>(new Set());
  const loadRef = useRef(load);
  loadRef.current = load;
  const pendingLat = useRef<RtEvent[]>([]);
  const newTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const groupsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const loadGroupsRef = useRef(loadGroups);
  loadGroupsRef.current = loadGroups;
  useRealtimeEvents(realtime, (e) => {
    if (e.type === "resync") { if (msgs !== null) setMsgs(null); setGroupMsgs({}); return; }
    // privado: as contrapropostas dos outros vêm do grupo de origem dos pedidos
    if (!group && e.chatKind === "GROUP" && e.chatId && originChats.split(",").includes(e.chatId)) {
      if (e.type === "message.delete") setGroupMsgs((cur) => (cur[e.chatId!] ? { ...cur, [e.chatId!]: cur[e.chatId!]!.filter((m) => m.id !== e.msgId) } : cur));
      else { clearTimeout(groupsTimer.current); groupsTimer.current = setTimeout(() => void loadGroupsRef.current(), 150); }
      return;
    }
    if (e.chatKind !== chatKind || e.chatId !== chatId || msgs === null) return; // não carregado ainda: carrega ao abrir
    if (e.type === "message.new") {
      pendingLat.current.push(e);
      clearTimeout(newTimer.current);
      newTimer.current = setTimeout(() => void loadRef.current(), 40); // uma rajada vira uma busca só
    } else if (e.type === "message.edit" && e.msgId) {
      void api<{ items: Msg[] }>(`${url}?ids=${e.msgId}`).then((r) => {
        if (!r.ok || !r.data.items[0]) return;
        const item = r.data.items[0];
        setMsgs((cur) => (cur ?? []).map((m) => (m.id === item.id ? { ...m, ...item } : m)));
      });
    } else if (e.type === "message.delete" && e.msgId) {
      setMsgs((cur) => (cur ?? []).filter((m) => m.id !== e.msgId));
    } else if (e.type === "dm.read" && e.maxId) {
      setReadMax((r) => Math.max(r, e.maxId!));
    }
  });
  // as mensagens que o tempo real avisou já estão na tela: mede a latência e destaca
  useEffect(() => {
    if (!pendingLat.current.length || !msgs) return;
    const have = new Set(msgs.map((m) => m.id));
    const shown = pendingLat.current.filter((e) => e.msgId != null && have.has(e.msgId));
    if (!shown.length) return;
    pendingLat.current = pendingLat.current.filter((e) => !shown.includes(e));
    requestAnimationFrame(() => { for (const e of shown) reportLatency(e); });
    const ids = shown.map((e) => e.msgId!).filter((id) => !msgs.find((m) => m.id === id)?.out);
    if (!ids.length) return;
    setFresh((f) => new Set([...f, ...ids]));
    setTimeout(() => setFresh((f) => { const n = new Set(f); for (const id of ids) n.delete(id); return n; }), 2500);
  }, [msgs]);
  // vindo da aba Alertas: rola até o pedido e já abre a contraproposta para ele
  const focused = useRef(0);
  const [flash, setFlash] = useState<number | null>(null); // a mensagem que veio de outra aba fica destacada por um tempo
  const refreshed = useRef(0); // já buscou as novas para este clique (o pedido pode ter chegado depois da última leitura)
  useEffect(() => {
    if (!focus || !visible || msgs === null || focused.current === focus.n) return;
    const m = msgs.find((x) => x.id === focus.id);
    if (!m && refreshed.current !== focus.n && focus.id > (msgs.at(-1)?.id ?? 0)) {
      refreshed.current = focus.n;
      return void load();
    }
    focused.current = focus.n;
    if (!m) return void toast("Esse pedido não está mais entre as últimas mensagens do chat", "error");
    stick.current = false;
    if (!m.out && focus.reply !== false) reply(m);
    setFlash(m.id);
    setTimeout(() => setFlash((f) => (f === m.id ? null : f)), 2500);
    requestAnimationFrame(() => document.getElementById(msgDomId(url, m.id))?.scrollIntoView({ block: "center", behavior: "smooth" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reply só põe o estado da resposta
  }, [focus, visible, msgs, url, load]);
  // aba aberta na tela: o que chegou conta como visto
  const lastId = msgs?.at(-1)?.id;
  useEffect(() => { if (visible && lastId && onSeen) onSeen(lastId); }, [visible, lastId, onSeen]);
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, visible, onlyAds]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    const rep = replying; // guardado: a contraproposta vai também no privado do autor
    const body = text;
    setSending(true);
    const r = editing
      ? await api<{ item: Msg }>(`${url}/${editing.id}`, "PATCH", { text })
      : await api<{ item: Msg }>(url, "POST", { text, ...(rep ? { replyTo: rep.id } : {}) });
    setSending(false);
    if (!r.ok) return toast(r.erro, "error");
    const item = r.data.item;
    setText("");
    setReplying(null);
    if (editing) {
      setEditing(null);
      setMsgs((cur) => (cur ?? []).map((m) => (m.id === item.id ? { ...m, text: item.text, ad: item.ad } : m)));
      return toast("Mensagem editada");
    }
    stick.current = true;
    setMsgs((cur) => (cur?.some((m) => m.id === item.id) ? cur : [...(cur ?? []), item]));
    // contraproposta a um pedido: manda a mesma no privado do autor (um só clique faz os dois)
    if (source.kind === "group" && rep?.ad && alsoPrivate) void alsoDmOffer(source.chat.id, rep, body);
  }
  /** Depois da contraproposta no grupo, leva o pedido para o privado do autor e manda a mesma contraproposta como
   *  resposta a ele; a conversa aparece na barra ligada ao pedido. */
  async function alsoDmOffer(chatId: string, ad: Msg, body: string) {
    const r = await api<{ item: { dm: Dm; forwarded: boolean } }>(`/api/telegram/chats/${chatId}/offer-dm`, "POST", { messageId: ad.id, text: body, adText: ad.text });
    if (!r.ok) return toast(`Contraproposta no grupo enviada; no privado de ${ad.sender} falhou: ${r.erro}`, "error");
    onOfferDm?.(r.data.item.dm);
    toast(r.data.item.forwarded ? `Pedido e contraproposta também no privado de ${ad.sender}` : `Contraproposta também no privado de ${ad.sender} (o grupo não deixa encaminhar o pedido)`);
  }
  function reply(m: Msg) {
    setEditing(null);
    setReplying(m);
    input.current?.focus();
  }
  function edit(m: Msg) {
    setReplying(null);
    setEditing(m);
    setText(m.text);
    input.current?.focus();
  }
  function cancel() {
    if (editing) setText("");
    setEditing(null);
    setReplying(null);
  }
  async function remove(m: Msg) {
    const ok = await confirmDialog({ title: "Excluir a sua mensagem?", body: `"${quote(m)}" sai do ${group ? "grupo" : "privado"} para todos.`, confirmLabel: "Excluir", danger: true });
    if (!ok) return;
    const r = await api(`${url}/${m.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    if (editing?.id === m.id) cancel();
    setMsgs((cur) => (cur ?? []).filter((x) => x.id !== m.id));
    toast("Mensagem excluída");
  }
  /** Registra o pedido no CRM Milhas (cpmCents = o da sua contraproposta; sem ele, o do pedido). */
  const [registering, setRegistering] = useState<number | null>(null);
  async function registerCrm(ad: Msg, cpmCents?: number) {
    if (!group) return;
    setRegistering(ad.id);
    const r = await api<{ item: CrmRef }>(`/api/telegram/chats/${source.chat.id}/crm`, "POST", { messageId: ad.id, text: ad.text, sender: ad.sender, cpmCents: cpmCents ?? null });
    setRegistering(null);
    if (!r.ok) return toast(r.erro, "error");
    const crm = { id: r.data.item.id, number: r.data.item.number, stage: r.data.item.stage, accountId: r.data.item.accountId };
    setMsgs((cur) => (cur ?? []).map((m) => (m.id === ad.id ? { ...m, crm } : m)));
    toast(`Negociação #${crm.number} registrada no CRM Milhas`);
  }

  /** Limpa o chat só aqui: as mensagens até agora somem da tela; as novas continuam chegando. */
  async function clearChat() {
    const last = msgs?.at(-1)?.id;
    if (!last) return;
    const ok = await confirmDialog({ title: "Limpar este chat?", body: "As mensagens somem só daqui do app; no Telegram continuam. As novas continuam aparecendo, e dá para mostrar as antigas de novo.", confirmLabel: "Limpar" });
    if (!ok) return;
    const r = await api(clearUrl, "POST", { upTo: last });
    if (!r.ok) return toast(r.erro, "error");
    cancel();
    setCleared(last);
    setMsgs([]);
    toast("Chat limpo");
  }
  async function showAgain() {
    const r = await api(clearUrl, "POST", { upTo: null });
    if (!r.ok) return toast(r.erro, "error");
    setCleared(null);
    stick.current = true;
    setMsgs(null); // carrega de novo as últimas mensagens
  }
  async function dm(id: number) {
    if (!onDm) return;
    setOpening(id);
    await onDm(id);
    setOpening(null);
  }

  // o pedido em jogo no campo: o que está sendo respondido, ou o que a mensagem editada responde
  const target = replying?.ad ? replying : editing?.replyTo ? byId.get(editing.replyTo) : undefined;
  const typedCents = target?.ad ? parseCounterOffer(text) : null;
  const typedProfit = target?.ad && typedCents != null ? emissionAnalysis(target.ad, typedCents, accounts) : null;
  const title = group ? source.chat.title : `${source.dm.name}${source.dm.username ? ` (@${source.dm.username})` : ""}`;
  const refresh = live ? "em tempo real" : "atualiza a cada 15 s";
  const status = group
    ? `Grupo · ${source.chat.account} · ${refresh}${msgs ? ` · ${msgs.filter((m) => m.ad).length} pedidos` : ""}`
    : `Privado · ${source.dm.via}${source.dm.group ? ` · do grupo ${source.dm.group}` : ""} · ${refresh}`;

  // pedido em foco (resumo no topo e detalhes no painel): o clicado; no grupo, o que está sendo respondido; no
  // privado, o pedido a que a conversa está ligada
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = (selectedId != null ? byId.get(selectedId) : undefined) ?? (target?.ad ? target : undefined);
  function select(m: Msg) {
    setSelectedId(m.id);
    setPanel?.(true);
  }
  // privado: o pedido ligado à conversa e o CRM dele
  const dmOffer = source.kind === "dm" ? source.dm.offer ?? null : null;
  const dmAd = dmOffer?.text ? parseBalcaoAd(dmOffer.text) : null;
  const [dmCrm, setDmCrm] = useState(source.kind === "dm" ? source.dm.crm ?? null : null);
  const [registeringOffer, setRegisteringOffer] = useState(false);
  async function registerOffer() {
    if (!dmOffer) return;
    setRegisteringOffer(true);
    const cpm = liveOffer ?? dmOffer.cpmCents;
    const r = await api<{ item: CrmRef }>(`/api/telegram/chats/${dmOffer.chatId}/crm`, "POST", { messageId: dmOffer.messageId, text: dmOffer.text, sender: dmOffer.sender, cpmCents: cpm ?? null });
    setRegisteringOffer(false);
    if (!r.ok) return toast(r.erro, "error");
    setDmCrm({ id: r.data.item.id, number: r.data.item.number, stage: r.data.item.stage, accountId: r.data.item.accountId });
    toast(`Negociação #${r.data.item.number} registrada no CRM Milhas`);
  }
  // o que o resumo e o painel mostram
  const focusOrder: OrderView | null = selected?.ad
    ? {
        ad: selected.ad, askedCents: selected.ad.cpmCents, offerCents: myOfferFor(selected), sender: selected.out && selected.fwd ? source.kind === "dm" ? source.dm.name : selected.sender : selected.sender,
        group: group ? source.chat.title : dmOffer?.group ?? null, at: selected.date, crm: selected.crm ?? (selected.fwd && dmCrm ? dmCrm : null),
        onRegister: group ? (cents) => registerCrm(selected, cents) : selected.fwd && dmOffer ? () => registerOffer() : undefined, registering: registering === selected.id || (selected.fwd && registeringOffer),
        onGoToGroup: !group && selected.origin && onGoToGroup ? () => onGoToGroup(selected.origin!.chatId, selected.origin!.messageId) : undefined,
        onReply: !selected.out ? () => reply(selected) : undefined, onClear: () => setSelectedId(null),
      }
    : dmOffer && dmAd
      ? {
          ad: dmAd, askedCents: dmAd.cpmCents, offerCents: liveOffer ?? dmOffer.cpmCents, sender: dmOffer.sender, group: dmOffer.group, at: dmOffer.at, crm: dmCrm,
          onRegister: () => registerOffer(), registering: registeringOffer, onGoToGroup: onGoToGroup ? () => onGoToGroup(dmOffer.chatId, dmOffer.messageId) : undefined,
        }
      : null;
  /** A sua contraproposta mais nova ao pedido (resposta a ele, no grupo ou no privado). */
  function myOfferFor(ad: Msg) {
    const mine = (offersOf(ad) ?? []).filter((o) => o.out).map((o) => parseCounterOffer(o.text)).filter((c): c is number => c != null);
    return mine.at(-1) ?? (ad.fwd ? liveOffer ?? dmOffer?.cpmCents ?? null : null);
  }

  // separador de dia entre as mensagens (Hoje, Ontem, data)
  let lastDay = "";
  return (
    <div className="flex min-w-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-line px-2 py-2.5 sm:gap-3 sm:px-4">
          {onBack && <button type="button" onClick={onBack} className="btn-subtle h-9 w-9 shrink-0 px-0 md:hidden" aria-label="Voltar para as conversas"><ArrowLeft className="h-5 w-5" /></button>}
          <Avatar kind={group ? "group" : "dm"} name={title} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{title}</h2>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted">{live && <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />}<span className="truncate">{status}</span></p>
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {group && (
              <button type="button" aria-pressed={onlyAds} onClick={() => setOnlyAds(!onlyAds)} className={`btn h-9 gap-1.5 px-2.5 text-sm ${onlyAds ? "bg-accent-soft text-accent-light" : "text-muted hover:bg-panel2 hover:text-zinc-100"}`} title="Mostrar só os pedidos (esconde a conversa; as contrapropostas ficam embaixo de cada pedido)">
                <ListFilter className="h-4 w-4" /><span className="hidden lg:inline">Só pedidos</span>
              </button>
            )}
            <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => void load()} disabled={loading} aria-label="Atualizar agora" title="Atualizar agora"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
            <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={clearChat} disabled={!msgs?.length} aria-label="Limpar o chat aqui" title="Limpa só aqui no app; no Telegram as mensagens continuam"><Eraser className="h-4 w-4" /></button>
            <button type="button" aria-pressed={panel} onClick={() => setPanel?.(!panel)} className={`btn h-9 w-9 px-0 ${panel ? "bg-accent-soft text-accent-light" : "text-muted hover:bg-panel2 hover:text-zinc-100"}`} aria-label={panel ? "Esconder os detalhes do pedido" : "Mostrar os detalhes do pedido"} title="Detalhes do pedido"><Info className="h-4 w-4" /></button>
          </div>
        </header>
        {cleared != null && (
          <div className="flex items-center gap-2 border-b border-line bg-panel2 px-4 py-1.5 text-sm text-muted">
            <Eraser className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1">Chat limpo aqui: aparecem só as mensagens novas.</span>
            <button type="button" onClick={showAgain} className="shrink-0 font-medium text-accent-light hover:underline">Mostrar de novo</button>
          </div>
        )}
        {focusOrder && <OrderSummary o={focusOrder} accounts={accounts} onDetails={() => setPanel?.(true)} />}
        {erro && <div className="p-3"><Alert>{erro}</Alert></div>}
        <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="flex-1 space-y-3 overflow-y-auto px-3 py-4 sm:px-5" aria-live="polite" aria-relevant="additions">
          {shown === null ? <p className="text-sm text-muted">Carregando as mensagens…</p>
            : shown.length === 0 ? <p className="py-8 text-center text-sm text-muted">{cleared != null && !msgs?.length ? "Chat limpo. As mensagens novas aparecem aqui." : onlyAds ? "Nenhum pedido nas últimas mensagens." : group ? "Nenhuma mensagem neste grupo." : "Nenhuma mensagem ainda: escreva abaixo para começar a conversa."}</p>
            : shown.map((m) => {
              const day = dayLabel(m.date);
              const sep = day !== lastDay;
              lastDay = day;
              return (
                <div key={m.id} className="space-y-3">
                  {sep && <div className="flex justify-center"><span className="rounded-full bg-panel2 px-3 py-1 text-xs font-medium text-muted">{day}</span></div>}
                  <Bubble domId={msgDomId(url, m.id)} m={m} mediaBase={url.replace(/\/messages$/, "")} quoted={m.replyTo ? byId.get(m.replyTo) ?? null : undefined} replying={replying?.id === m.id || editing?.id === m.id} flash={flash === m.id} fresh={fresh.has(m.id)} selected={selected?.id === m.id} offers={m.ad ? offersOf(m) : undefined}
                    showSender={group} profit={m.ad ? emissionAnalysis(m.ad, myOfferFor(m) ?? m.ad.cpmCents, accounts) : null}
                    profitAt={m.ad ? (cents) => emissionAnalysis(m.ad!, cents, accounts) : undefined}
                    onSelect={m.ad ? () => select(m) : undefined}
                    onCrm={group && m.ad ? (cents) => registerCrm(m, cents) : undefined} registering={registering === m.id}
                    onReply={() => reply(m)} onDm={group && m.fromUser && !m.out ? () => dm(m.id) : undefined} opening={opening === m.id}
                    onGroup={!group && m.origin && onGoToGroup ? () => onGoToGroup(m.origin!.chatId, m.origin!.messageId) : undefined}
                    onEdit={m.out && m.text && !m.fwd ? () => edit(m) : undefined} onDelete={m.out ? () => remove(m) : undefined}
                    onEditOffer={edit} onDeleteOffer={remove} editingId={editing?.id}
                    read={!group && m.out ? m.id <= readMax : undefined} />
                </div>
              );
            })}
        </div>
        <form onSubmit={send} className="border-t border-line p-2 sm:p-3">
          {(replying || editing) && (
            <div className="mb-2 flex items-center gap-2 rounded-xl border-l-4 border-accent-light bg-panel2 px-3 py-2 text-sm">
              {editing ? <Pencil className="h-4 w-4 shrink-0 text-accent-light" /> : <Reply className="h-4 w-4 shrink-0 text-accent-light" />}
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-accent-light">
                  {editing ? (target?.ad ? `Editando a sua contraproposta para ${target.sender}` : "Editando a sua mensagem") : replying!.ad ? `Contraproposta para ${replying!.sender}` : `Respondendo a ${replying!.sender}`}
                </p>
                <p className="truncate text-muted">{target ? quote(target) : quote((editing ?? replying)!)}</p>
                {/* lucro com o valor digitado (some quando nenhuma conta sua consegue emitir) */}
                {typedProfit && <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs"><span className="text-muted">Com {fmtBRL(typedCents!)}:</span><AnalysisLine a={typedProfit} compact /></div>}
              </div>
              <button type="button" onClick={cancel} className="btn-subtle h-8 w-8 shrink-0 px-0" aria-label={editing ? "Cancelar a edição" : replying!.ad ? "Cancelar a contraproposta" : "Cancelar a resposta"} title="Cancelar (Esc)"><X className="h-4 w-4" /></button>
            </div>
          )}
          {source.kind === "group" && replying?.ad && onOfferDm && !editing && (
            <label className="mb-2 flex cursor-pointer items-center gap-2 px-1 text-sm text-muted">
              <input type="checkbox" checked={alsoPrivate} onChange={(e) => setAlsoPrivate(e.target.checked)} className="h-4 w-4 accent-accent-light" />
              Mandar também no privado de <b className="text-zinc-200">{replying.sender}</b>
            </label>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendAttachment(f); }} aria-label="Anexar arquivo" />
            {!editing && <button type="button" className="btn-subtle h-11 w-11 shrink-0 rounded-full px-0" onClick={() => fileInput.current?.click()} disabled={uploading} title="Enviar foto, print ou PDF" aria-label="Enviar foto, print ou PDF"><Paperclip className="h-5 w-5" /></button>}
            <textarea
              ref={input}
              className="input min-h-11 flex-1 resize-none rounded-[22px] px-4 py-2.5 text-[15px] leading-6"
              rows={Math.min(5, Math.max(1, text.split("\n").length))}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
                if (e.key === "Escape" && (replying || editing)) { e.preventDefault(); cancel(); }
              }}
              maxLength={4096}
              placeholder={target?.ad ? "Sua contraproposta (ex.: 24,50)" : replying ? `Resposta para ${replying.sender}` : group ? `Mensagem para o grupo ${source.chat.title}` : `Mensagem para ${source.dm.name}`}
              aria-label={editing ? "Editar a mensagem" : replying ? `Resposta para ${replying.sender}` : group ? "Mensagem para o grupo" : "Mensagem no privado"}
            />
            <button className="btn-primary h-11 w-11 shrink-0 rounded-full px-0" disabled={sending || !text.trim()} aria-label={sending ? "Enviando" : editing ? "Salvar a edição" : replying ? "Responder" : "Enviar"} title="Enviar (Enter; Shift+Enter quebra a linha)">
              {editing ? <Check className="h-5 w-5" /> : <Send className="h-5 w-5" />}
            </button>
          </div>
        </form>
      </div>
      {panel && <OrderPanel o={focusOrder} accounts={accounts} title={title} isGroup={group} onClose={() => setPanel?.(false)} />}
    </div>
  );
}

type Analysis = ReturnType<typeof emissionAnalysis>;

/** O pedido em foco na conversa: o que foi pedido, a sua contraproposta, de quem e de onde, e as ações sobre ele. */
type OrderView = {
  ad: BalcaoAd; askedCents: number | null; offerCents: number | null; sender: string; group: string | null; at: string; crm: CrmRef | null;
  onRegister?: (cpmCents?: number) => void; registering?: boolean; onGoToGroup?: () => void; onReply?: () => void; onClear?: () => void;
};
/** Lucro do pedido pela sua contraproposta (ou pelo pedido) na conta da negociação, se já tem, ou na sugerida. */
function orderProfit(o: OrderView, accounts: EmissionAccount[]) {
  const dealAccount = o.crm?.accountId ? accounts.filter((a) => a.id === o.crm!.accountId) : [];
  return emissionAnalysis(o.ad, o.offerCents ?? o.askedCents, dealAccount.length ? dealAccount : accounts);
}

/** Resumo compacto no topo da conversa: "LATAM · 36.000 milhas · 2 CPFs · R$ 26,50/milheiro · Lucro R$ 187,20". */
function OrderSummary({ o, accounts, onDetails }: { o: OrderView; accounts: EmissionAccount[]; onDetails: () => void }) {
  const a = orderProfit(o, accounts);
  return (
    <div className="border-b border-line px-2 py-2 sm:px-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl bg-panel2 px-3 py-2 text-sm" aria-label="Pedido em foco">
        <PlaneTakeoff className="h-4 w-4 shrink-0 text-accent-light" aria-hidden />
        <span className="min-w-0 flex-1 truncate font-medium text-zinc-100" title={`Pedido de ${o.sender}${o.group ? ` no grupo ${o.group}` : ""}`}>
          <span className="text-muted">Pedido · </span>{adLine(o.ad, o.offerCents ?? o.askedCents)}
        </span>
        {a?.covers && a.profitCents != null && (
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-sm font-semibold ${a.profitCents >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{a.profitCents >= 0 ? "Lucro" : "Prejuízo"} {fmtBRL(Math.abs(a.profitCents))}</span>
        )}
        {a && !a.covers && <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm font-semibold text-amber-300">Nenhuma conta cobre</span>}
        <span className="flex shrink-0 items-center gap-1">
          {o.onGoToGroup && <button type="button" onClick={o.onGoToGroup} className="btn h-8 gap-1.5 border border-line px-2.5 text-sm text-accent-light hover:bg-panel" title={o.group ? `Ir para o pedido no grupo ${o.group}` : "Ir para o pedido no grupo"}><ExternalLink className="h-4 w-4" />Ver no grupo</button>}
          {o.onReply && <button type="button" onClick={o.onReply} className="btn h-8 gap-1.5 border border-line px-2.5 text-sm text-accent-light hover:bg-panel"><Reply className="h-4 w-4" />Contraproposta</button>}
          <button type="button" onClick={onDetails} className="btn-subtle h-8 w-8 px-0" aria-label="Ver os detalhes do pedido" title="Detalhes"><Info className="h-4 w-4" /></button>
          {o.onClear && <button type="button" onClick={o.onClear} className="btn-subtle h-8 w-8 px-0" aria-label="Tirar o pedido do foco" title="Tirar do foco"><X className="h-4 w-4" /></button>}
        </span>
      </div>
    </div>
  );
}

/** Painel de detalhes do pedido em foco (à direita; em tela menor abre por cima): companhia, milhas, CPFs, valor por
 *  milheiro, lucro, a conta que emite e o que sobra nela, quem pediu e onde; CRM, "Ver no grupo" e "Novo lançamento"
 *  (a emissão avulsa, já preenchida). */
function OrderPanel({ o, accounts, title, isGroup, onClose }: { o: OrderView | null; accounts: EmissionAccount[]; title: string; isGroup: boolean; onClose: () => void }) {
  const a = o ? orderProfit(o, accounts) : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !window.matchMedia("(min-width: 1536px)").matches) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  function newEntry() {
    if (!o) return;
    openEntryForm("debit", {
      accountId: o.crm?.accountId ?? (a?.covers ? a.accountId : "") ?? "", type: "FLIGHT_REDEMPTION", points: o.ad.miles,
      description: `Pedido de ${o.sender}${o.group ? ` · ${o.group}` : ""} · ${adLine(o.ad, o.offerCents ?? o.askedCents)}`, costs: [],
    });
  }
  const row = (label: string, value: React.ReactNode, hint?: string) => (
    <div className="flex items-baseline justify-between gap-3 py-2" title={hint}>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium tabular-nums text-zinc-100">{value}</dd>
    </div>
  );
  return (
    <>
      {/* em tela menor o painel fica por cima: o fundo escurecido fecha */}
      <button type="button" aria-label="Fechar os detalhes" onClick={onClose} className="fixed inset-0 z-30 bg-black/40 2xl:hidden" tabIndex={-1} />
      <aside className="fixed inset-y-0 right-0 z-40 flex w-[340px] max-w-[92vw] flex-col border-l border-line bg-panel shadow-2xl 2xl:static 2xl:z-auto 2xl:w-[320px] 2xl:max-w-none 2xl:shadow-none" aria-label="Detalhes do pedido">
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <h3 className="min-w-0 flex-1 truncate font-semibold">Detalhes do pedido</h3>
          <button ref={closeRef} type="button" onClick={onClose} className="btn-subtle h-9 w-9 px-0" aria-label="Fechar os detalhes"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!o ? (
            <div className="space-y-2 text-sm text-muted">
              <p className="font-medium text-zinc-200">{title}</p>
              <p>{isGroup ? "Toque em um pedido da conversa (ou em Contraproposta) para ver aqui a companhia, as milhas, os CPFs, o milheiro e o lucro." : "Esta conversa ainda não está ligada a um pedido do grupo."}</p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <p className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${o.ad.kind === "COMPRA" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>{o.ad.kind === "COMPRA" ? "Compra" : "Venda"}</span>
                  <span className="text-lg font-semibold">{o.ad.program}</span>
                </p>
                <p className="text-sm text-muted">De <b className="font-medium text-zinc-200">{o.sender}</b>{o.group ? <> no grupo <b className="font-medium text-zinc-200">{o.group}</b></> : null} · {when(o.at)}</p>
              </div>
              <dl className="divide-y divide-line rounded-xl border border-line px-3">
                {row("Companhia", o.ad.program)}
                {row("Milhas", fmtPts(o.ad.miles))}
                {row("CPFs", <>{o.ad.cpfs ?? 1}{o.ad.cpfs == null && <span className="font-normal text-muted"> (não disse)</span>}</>)}
                {row("Milheiro pedido", o.askedCents != null ? fmtBRL(o.askedCents) : "sem preço")}
                {o.offerCents != null && row("Sua contraproposta", <span className="text-accent-light">{fmtBRL(o.offerCents)}</span>)}
                {a?.covers && a.profitCents != null && row(a.profitCents >= 0 ? "Lucro" : "Prejuízo", <span className={a.profitCents >= 0 ? "text-emerald-300" : "text-red-300"}>{fmtBRL(Math.abs(a.profitCents))}<span className="block text-xs font-normal text-muted">{fmtBRL(a.perCpfCents!)} por CPF</span></span>)}
              </dl>
              {a && (
                <div className="space-y-1 rounded-xl bg-panel2 p-3 text-sm">
                  <p className="font-medium">{a.covers ? "Conta que emite" : "Nenhuma conta cobre sozinha"}</p>
                  <p className="text-muted">{a.account} · custo {fmtBRL(a.costCpmCents)}/milheiro{a.accounts > 1 ? ` · ${a.accounts} contas no programa` : ""}</p>
                  {a.covers
                    ? <p className="text-muted">Depois: {fmtPts(a.balanceAfter)} milhas · {a.cpfAfter} {a.cpfAfter === 1 ? "CPF livre" : "CPFs livres"}{a.leftoverPoints > 0 ? ` · sobra ${a.leftoverCostCents > 0 ? fmtBRL(a.leftoverCostCents) : `${fmtPts(a.leftoverPoints)} milhas`} (não paga outra emissão)` : ""}</p>
                    : <p className="text-amber-300">{!a.enough ? `Faltam ${fmtPts(a.missingMiles)} milhas` : "Sem CPF livre para os passageiros"}: divida os passageiros entre contas.</p>}
                </div>
              )}
              {!a && <p className="text-sm text-muted">Nenhuma conta sua de {o.ad.program} com saldo para calcular o lucro.</p>}
              <div className="space-y-2">
                {o.onGoToGroup && <button type="button" onClick={o.onGoToGroup} className="btn-ghost h-10 w-full gap-2"><ExternalLink className="h-4 w-4" />Ver no grupo</button>}
                {o.onReply && <button type="button" onClick={o.onReply} className="btn-ghost h-10 w-full gap-2"><Reply className="h-4 w-4" />Mandar contraproposta</button>}
                {o.crm
                  ? <Link href={`/app/crm-milhas?deal=${o.crm.id}`} className="btn-ghost h-10 w-full gap-2 text-emerald-300"><KanbanSquare className="h-4 w-4" />No CRM #{o.crm.number} · {DEAL_STAGE_LABELS[o.crm.stage as DealStageKey] ?? o.crm.stage}</Link>
                  : o.onRegister && <button type="button" onClick={() => o.onRegister!(o.offerCents ?? undefined)} disabled={o.registering} className="btn-ghost h-10 w-full gap-2"><KanbanSquare className="h-4 w-4" />{o.registering ? "Registrando…" : `Registrar no CRM${o.offerCents != null ? ` com ${fmtBRL(o.offerCents)}` : ""}`}</button>}
                <button type="button" onClick={newEntry} className="btn-primary h-10 w-full gap-2"><Plus className="h-4 w-4" />Novo lançamento</button>
                <p className="text-xs leading-5 text-muted">Abre a emissão de passagem já preenchida (conta, milhas e descrição). Se o pedido estiver no CRM, a baixa das milhas já acontece ao marcar como emitido lá: não lance duas vezes.</p>
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

/** Uma mensagem, em balão: recebida à esquerda (clara), enviada à direita (azul). O pedido aparece compacto (companhia,
 *  milhas, CPFs, milheiro e o lucro); os detalhes ficam no painel (onSelect). As contrapropostas aparecem embaixo do
 *  pedido, como respostas a ele. As ações aparecem ao passar o mouse ou ao focar (no toque, sempre).
 *  quoted: a mensagem respondida (null = fora das carregadas; undefined = não é resposta); profit: análise do pedido
 *  pelas regras da negociação; profitAt: o lucro por outro milheiro (o da sua contraproposta). */
function Bubble({ m, domId, chat, mediaBase, onOpen, onNegotiate, onDm, opening, onReply, replying, flash, fresh, selected, showSender = true, onGroup, onSelect, quoted, offers, analysis, profit, profitAt, onEdit, onDelete, onEditOffer, onDeleteOffer, editingId, onCrm, registering, read }: {
  m: Msg; domId?: string; chat?: string; mediaBase?: string; onOpen?: () => void; onNegotiate?: () => void; onDm?: () => void; opening?: boolean; onReply?: () => void; replying?: boolean; flash?: boolean; fresh?: boolean; selected?: boolean; showSender?: boolean; onGroup?: () => void; onSelect?: () => void; quoted?: Msg | null; offers?: Msg[];
  analysis?: Analysis; profit?: Analysis; profitAt?: (cpmCents: number) => Analysis; onEdit?: () => void; onDelete?: () => void; onEditOffer?: (m: Msg) => void; onDeleteOffer?: (m: Msg) => void; editingId?: number;
  onCrm?: (cpmCents?: number) => void; registering?: boolean; read?: boolean; // privado: true = visualizada, false = entregue, undefined = não mostra
}) {
  const hit = m.alerts.length > 0;
  const out = m.out;
  const a = profit ?? analysis;
  const [full, setFull] = useState(false); // texto longo do pedido: as primeiras linhas e "ver mais"
  async function copy() {
    try {
      await navigator.clipboard.writeText(m.text);
      toast("Mensagem copiada");
    } catch {
      toast("Não deu para copiar", "error");
    }
  }
  const ring = replying ? "ring-2 ring-accent-light" : selected ? "ring-2 ring-accent-light/70" : flash ? "ring-2 ring-amber-400" : fresh ? "ring-2 ring-emerald-400/70" : "";
  const chip = out ? "bg-black/10 text-zinc-950" : m.ad?.kind === "COMPRA" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300";
  const action = "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium hover:bg-panel2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-light";
  return (
    <div id={domId} className={`group flex scroll-mt-4 gap-2 ${out ? "justify-end" : "justify-start"}`}>
      {!out && <div className="mt-auto pb-6"><Avatar kind="dm" name={m.sender} size="sm" /></div>}
      <div className={`flex min-w-0 max-w-[min(85%,600px)] flex-col ${out ? "items-end" : "items-start"}`}>
        {!out && (showSender || chat) && (
          <span className="mb-0.5 flex max-w-full items-baseline gap-2 px-3 text-xs">
            <span className="truncate font-medium text-zinc-300">{m.sender}</span>
            {chat && <button type="button" onClick={onOpen} className="truncate text-accent-light hover:underline">{chat}</button>}
          </span>
        )}
        <div
          onClick={onSelect ? (e) => { if (!(e.target as HTMLElement).closest("a,button")) onSelect(); } : undefined}
          className={`max-w-full rounded-[20px] px-3.5 py-2 transition-shadow duration-700 ${out ? "rounded-br-md bg-accent-light text-zinc-950" : hit ? "rounded-bl-md bg-amber-500/15 ring-1 ring-amber-500/40" : "rounded-bl-md bg-panel2"} ${ring} ${onSelect ? "cursor-pointer" : ""}`}
        >
          {quoted !== undefined && (
            <p className={`mb-1.5 flex items-center gap-1.5 truncate rounded-lg border-l-4 px-2 py-1 text-xs ${out ? "border-zinc-950/30 bg-black/10 text-zinc-900" : "border-line bg-black/10 text-muted"}`}>
              <CornerDownRight className="h-3.5 w-3.5 shrink-0" />{quoted ? <><b className="font-semibold">{quoted.sender}:</b> {quote(quoted)}</> : "resposta a uma mensagem mais antiga"}
            </p>
          )}
          {m.ad && (
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm" aria-label="Pedido lido da mensagem">
              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${chip}`}>{m.ad.kind === "COMPRA" ? "Compra" : "Venda"}</span>
              <span className="font-semibold">{adLine(m.ad)}</span>
              {a?.covers && a.profitCents != null && (
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${out ? "bg-black/10" : a.profitCents >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`} title={`${fmtBRL(a.perCpfCents!)} por CPF · ${a.account}`}>{a.profitCents >= 0 ? "Lucro" : "Prejuízo"} {fmtBRL(Math.abs(a.profitCents))}</span>
              )}
              {a && !a.covers && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${out ? "bg-black/10" : "bg-amber-500/15 text-amber-300"}`}>Nenhuma conta cobre</span>}
            </div>
          )}
          {m.media && (
            m.mediaKind === "photo" && mediaBase ? (
              <a href={`${mediaBase}/media/${m.id}`} target="_blank" rel="noreferrer" className="my-1 block w-fit" title="Abrir a imagem em tamanho cheio">
                <img src={`${mediaBase}/media/${m.id}`} alt={m.mediaName ?? "foto"} loading="lazy" className="max-h-64 max-w-full rounded-xl object-contain" />
              </a>
            ) : m.mediaKind === "file" && mediaBase ? (
              <a href={`${mediaBase}/media/${m.id}`} download={m.mediaName ?? undefined} className={`my-1 flex w-fit max-w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium ${out ? "bg-black/10" : "bg-black/10 text-accent-light hover:bg-black/20"}`} title="Baixar o arquivo">
                <Paperclip className="h-4 w-4 shrink-0" />
                <span className="truncate">{m.mediaName ?? m.media}</span>
                <Download className="h-4 w-4 shrink-0 opacity-70" />
              </a>
            ) : (
              <p className={`text-sm italic ${out ? "text-zinc-900" : "text-muted"}`}>[{m.media}]</p>
            )
          )}
          {m.text && (m.ad
            ? <div>
                <p className={`whitespace-pre-wrap break-words text-sm ${out ? "text-zinc-900" : "text-muted"} ${full ? "" : "line-clamp-3"}`}>{m.text}</p>
                {m.text.split("\n").length > 3 || m.text.length > 180 ? <button type="button" onClick={() => setFull(!full)} className={`mt-0.5 flex items-center gap-1 text-xs font-medium ${out ? "text-zinc-950" : "text-accent-light"} hover:underline`} aria-expanded={full}><ChevronDown className={`h-3.5 w-3.5 transition-transform ${full ? "rotate-180" : ""}`} />{full ? "ver menos" : "ver mensagem inteira"}</button> : null}
              </div>
            : <p className="whitespace-pre-wrap break-words text-[15px] leading-6">{m.text}</p>)}
          {hit && <div className="mt-1.5 flex flex-wrap gap-1">{m.alerts.map((x) => <span key={x} className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-xs font-medium text-amber-300"><BellRing className="h-3.5 w-3.5" />{x}</span>)}</div>}
        </div>
        {/* hora, leitura e ações (as ações aparecem ao passar o mouse, ao focar ou no toque) */}
        <div className={`mt-0.5 flex max-w-full flex-wrap items-center gap-x-0.5 gap-y-0.5 px-1 text-xs text-muted ${out ? "flex-row-reverse" : ""}`}>
          <span className="px-1.5 tabular-nums">{when(m.date)}</span>
          {read !== undefined && <span className="inline-flex" title={read ? "Visualizada pela pessoa" : "Entregue — ainda não visualizada"} aria-label={read ? "Visualizada" : "Entregue"}><Check className={`h-4 w-4 ${read ? "text-emerald-400" : "text-zinc-500"}`} strokeWidth={3} /></span>}
          {m.crm && <Link href={`/app/crm-milhas?deal=${m.crm.id}`} className={`${action} text-emerald-300`} title="Abrir a negociação no CRM Milhas"><KanbanSquare className="h-3.5 w-3.5" />CRM #{m.crm.number} · {DEAL_STAGE_LABELS[m.crm.stage as DealStageKey] ?? m.crm.stage}</Link>}
          <span className={`flex flex-wrap items-center gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100 ${replying || selected ? "opacity-100" : ""} ${out ? "flex-row-reverse" : ""}`}>
            {onNegotiate && <button type="button" onClick={onNegotiate} className={`${action} text-accent-light`} title="Ir para o pedido no chat e mandar a contraproposta"><Handshake className="h-3.5 w-3.5" />Negociação</button>}
            {onReply && <button type="button" onClick={onReply} className={`${action} text-accent-light`} aria-label={m.ad ? `Contraproposta para ${m.sender}` : `Responder ${m.sender}`} title={m.ad ? "Mandar a sua contraproposta como resposta a este pedido" : "Responder esta mensagem"}><Reply className="h-3.5 w-3.5" />{m.ad ? "Contraproposta" : "Responder"}</button>}
            {onSelect && <button type="button" onClick={onSelect} className={`${action} text-accent-light`} title="Ver os detalhes do pedido"><Info className="h-3.5 w-3.5" />Detalhes</button>}
            {onGroup && <button type="button" onClick={onGroup} className={`${action} text-accent-light`} title="Ir para este pedido no grupo"><ExternalLink className="h-3.5 w-3.5" />Ver no grupo</button>}
            {!m.crm && onCrm && <button type="button" onClick={() => onCrm()} disabled={registering} className={`${action} text-accent-light`} title="Registrar este pedido no CRM Milhas (com o milheiro do pedido)"><KanbanSquare className="h-3.5 w-3.5" />{registering ? "Registrando…" : "CRM"}</button>}
            {onDm && <button type="button" onClick={onDm} disabled={opening} className={`${action} text-accent-light`} title="Conversar no privado com quem mandou"><MessageCircle className="h-3.5 w-3.5" />{opening ? "Abrindo…" : "Privado"}</button>}
            {onEdit && <button type="button" onClick={onEdit} className={action} aria-label="Editar a sua mensagem" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>}
            {onDelete && <button type="button" onClick={onDelete} className={`${action} hover:text-red-300`} aria-label="Excluir a sua mensagem" title="Excluir para todos"><Trash2 className="h-3.5 w-3.5" /></button>}
            {m.text && <button type="button" onClick={copy} className={action} aria-label="Copiar mensagem" title="Copiar"><Copy className="h-3.5 w-3.5" /></button>}
          </span>
        </div>
        {offers && offers.length > 0 && <Offers offers={offers} onEdit={onEditOffer} onDelete={onDeleteOffer} editingId={editingId} profitAt={profitAt} onCrm={m.crm ? undefined : onCrm} registering={registering} />}
      </div>
    </div>
  );
}

/** Análise do pedido (grupo e privado) pelas MESMAS regras da negociação: a melhor conta, o saldo e os CPFs que
 *  ficam depois, a sobra que não paga outra emissão e o lucro. Quando a melhor conta não cobre sozinha, diz o que
 *  falta (aí o operador divide os passageiros entre contas). Vale também para a sua contraproposta (pelo seu preço). */
function AnalysisLine({ a, compact }: { a: NonNullable<Analysis>; compact?: boolean }) {
  const mt = compact ? "" : "mt-1";
  const title = `Sugestão pela regra da negociação: ${a.account} (custo ${fmtBRL(a.costCpmCents)}/milheiro)${a.accounts > 1 ? ` · ${a.accounts} contas no programa` : ""}`;
  if (!a.covers) {
    const why = !a.enough ? `faltam ${fmtPts(a.missingMiles)} milhas` : "sem CPF livre para os passageiros";
    return (
      <p className={`${mt} flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs`} aria-label="Análise do pedido" title={title}>
        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 font-semibold text-amber-300">Nenhuma conta cobre sozinha</span>
        <span className="text-muted">melhor: {a.account} · {why} · divida os passageiros entre contas</span>
      </p>
    );
  }
  const gain = (a.profitCents ?? 0) >= 0;
  return (
    <p className={`${mt} flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs`} aria-label="Análise do pedido" title={title}>
      {a.profitCents != null ? (
        <>
          <span className={`rounded px-1.5 py-0.5 font-semibold ${gain ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>{gain ? "Lucro" : "Prejuízo"} {fmtBRL(Math.abs(a.profitCents))}</span>
          <span className={gain ? "text-emerald-300" : "text-red-300"}>{fmtBRL(a.perCpfCents!)} por CPF</span>
        </>
      ) : (
        <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 font-medium text-muted">sem preço no pedido</span>
      )}
      <span className="text-muted">depois: {fmtPts(a.balanceAfter)} milhas · {a.cpfAfter} {a.cpfAfter === 1 ? "CPF" : "CPFs"} livres</span>
      {a.leftoverPoints > 0 && <span className="text-amber-300">· sobra {a.leftoverCostCents > 0 ? fmtBRL(a.leftoverCostCents) : `${fmtPts(a.leftoverPoints)} milhas`} (não paga outra emissão)</span>}
      <span className="text-muted">· {a.account}</span>
    </p>
  );
}

/** Contrapropostas dos membros a um pedido: do menor milheiro para o maior (sem valor por último), as 5 primeiras e
 *  o resto ao abrir. A sua aparece sempre, como "Você", com o lucro pelo seu preço (lucro, por CPF, sobra, CPFs
 *  livres e a conta), igual ao do pedido. */
function Offers({ offers, onEdit, onDelete, editingId, profitAt, onCrm, registering }: { offers: Msg[]; onEdit?: (m: Msg) => void; onDelete?: (m: Msg) => void; editingId?: number; profitAt?: (cpmCents: number) => Analysis; onCrm?: (cpmCents?: number) => void; registering?: boolean }) {
  const [all, setAll] = useState(false);
  const rows = offers
    .map((o) => ({ o, cents: parseCounterOffer(o.text) }))
    .sort((a, b) => (a.cents ?? Infinity) - (b.cents ?? Infinity) || a.o.date.localeCompare(b.o.date));
  const best = rows[0]?.cents ?? null;
  const visible = all ? rows : rows.filter((r, i) => i < 5 || r.o.out);
  return (
    // as contrapropostas como respostas ligadas ao pedido (um fio embaixo do balão)
    <div className="mt-1 w-full max-w-full border-l-2 border-accent-light/40 pl-3" aria-label="Contrapropostas a este pedido">
      <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-muted">
        <CornerDownRight className="h-3.5 w-3.5" aria-hidden />{offers.length} {offers.length === 1 ? "contraproposta" : "contrapropostas"}{best != null && <span className="font-normal"> · menor <b className="font-semibold text-emerald-300">{fmtBRL(best)}</b></span>}
      </p>
      <ul className="space-y-1">
        {visible.map(({ o, cents }) => {
          const mine = o.out && cents != null && profitAt ? profitAt(cents) : null; // o lucro pelo seu preço
          return (
            <li key={`${o.group ? "g" : "m"}${o.id}`} className={`rounded-xl px-2.5 py-1.5 text-sm ${o.out ? "bg-accent-soft" : "bg-panel2"} ${!o.group && editingId === o.id ? "ring-2 ring-accent-light" : ""}`}>
              <div className="flex items-baseline gap-2">
                <span className={`w-20 shrink-0 font-semibold tabular-nums ${cents != null && cents === best ? "text-emerald-300" : o.out ? "text-accent-light" : "text-zinc-100"}`}>{cents != null ? fmtBRL(cents) : "—"}</span>
                <span className="min-w-0 flex-1 truncate" title={o.group ? `${o.text} (no grupo)` : o.text}><span className={o.out ? "font-semibold text-accent-light" : "font-medium"}>{o.out ? "Você" : o.sender}</span>{o.group && <span className="ml-1.5 rounded-full bg-zinc-500/20 px-1.5 py-0.5 text-xs text-muted">no grupo</span>}{cents == null || o.text.replace(/[\d\s.,?r$]/gi, "").length > 0 ? <span className="text-muted"> · {o.text.replace(/\s+/g, " ").slice(0, 60)}</span> : null}</span>
                {o.out && cents != null && onCrm && <button type="button" onClick={() => onCrm(cents)} disabled={registering} className="flex shrink-0 items-center gap-1 self-center font-medium text-accent-light hover:underline" title="Registrar no CRM Milhas com o milheiro da sua contraproposta"><KanbanSquare className="h-3.5 w-3.5" />{registering ? "Registrando…" : "CRM"}</button>}
                {o.out && onEdit && <button type="button" onClick={() => onEdit(o)} className="shrink-0 self-center text-muted hover:text-zinc-100" aria-label="Editar a sua contraproposta" title="Editar a sua contraproposta"><Pencil className="h-3.5 w-3.5" /></button>}
                {o.out && onDelete && <button type="button" onClick={() => onDelete(o)} className="shrink-0 self-center text-muted hover:text-red-300" aria-label="Excluir a sua contraproposta" title="Excluir a sua contraproposta"><Trash2 className="h-3.5 w-3.5" /></button>}
                <span className="shrink-0 text-xs text-muted">{when(o.date)}</span>
              </div>
              {mine && <div className="mt-0.5 sm:ml-[5.5rem]"><AnalysisLine a={mine} compact /></div>}
            </li>
          );
        })}
      </ul>
      {rows.length > visible.length && <button type="button" onClick={() => setAll(true)} className="mt-1 text-xs font-medium text-accent-light hover:underline">Ver todas ({rows.length})</button>}
      {all && rows.length > 5 && <button type="button" onClick={() => setAll(false)} className="mt-1 text-xs font-medium text-accent-light hover:underline">Mostrar menos</button>}
    </div>
  );
}

/** Aba Alertas: cadastrar as palavras e ver as mensagens de todos os chats que dispararam algum alerta. */
function AlertsTab({ alerts, setAlerts, feed, errors, chats, openChat, reload, accounts, onNegotiate }: { alerts: AlertRule[]; setAlerts: (a: AlertRule[]) => void; feed: FeedMsg[] | null; errors: { chat: string; erro: string }[]; chats: Chat[]; openChat: (id: string) => void; reload: () => Promise<void>; accounts: EmissionAccount[]; onNegotiate: (chatId: string, id: number) => void }) {
  const empty = { name: "", words: "", program: "", maxCpfs: "", minMiles: "", maxMiles: "", minCpm: "", minProfit: "", minProfitCpf: "" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minMiles = milesInput(f.minMiles), maxMiles = milesInput(f.maxMiles);
    const minCpmCents = f.minCpm.trim() ? parseBRLToCents(f.minCpm) : null;
    const minProfitCents = f.minProfit.trim() ? parseBRLToCents(f.minProfit) : null;
    const minProfitPerCpfCents = f.minProfitCpf.trim() ? parseBRLToCents(f.minProfitCpf) : null;
    if (minMiles === undefined || maxMiles === undefined) return toast("Milhas inválidas: use 100k, 100.000 ou 100000", "error");
    if (f.minCpm.trim() && !minCpmCents) return toast("Milheiro inválido", "error");
    if ((f.minProfit.trim() && !minProfitCents) || (f.minProfitCpf.trim() && !minProfitPerCpfCents)) return toast("Lucro inválido", "error");
    const body = { name: f.name, words: parseAlertWords(f.words), program: f.program || null, maxCpfs: f.maxCpfs ? Number(f.maxCpfs) : null, minMiles, maxMiles, minCpmCents, minProfitCents, minProfitPerCpfCents };
    setBusy(true);
    const r = await api<{ items: AlertRule[] }>("/api/telegram/alerts", "POST", body);
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    setAlerts(r.data.items);
    setF(empty);
    toast("Alerta criado");
  }
  async function toggle(a: AlertRule) {
    const r = await api<{ items: AlertRule[] }>(`/api/telegram/alerts/${a.id}`, "PUT", { ...a, active: !a.active });
    if (!r.ok) return toast(r.erro, "error");
    setAlerts(r.data.items);
  }
  async function remove(a: AlertRule) {
    if (!(await confirmDialog({ title: `Excluir o alerta "${a.name}"?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api<{ items: AlertRule[] }>(`/api/telegram/alerts/${a.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    setAlerts(r.data.items);
  }
  async function askPermission() {
    if (typeof Notification === "undefined") return;
    setPerm(await Notification.requestPermission());
  }
  const titleOf = (id: string) => chats.find((c) => c.id === id)?.title ?? "";

  return (
    <div className="grid gap-4 2xl:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="space-y-4">
        <form onSubmit={save} className="card card-pad space-y-3">
          <p className="font-semibold">Novo alerta</p>
          <p className="text-xs text-muted">Avisa dos pedidos de compra que atendem tudo o que você preencher. Deixe em branco o que tanto faz.</p>
          <Field label="Programa">
            <select className="input" value={f.program} onChange={set("program")} aria-label="Programa do alerta">
              <option value="">Qualquer programa</option>
              {BALCAO_PROGRAMS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Até quantos CPFs"><input className="input" inputMode="numeric" value={f.maxCpfs} onChange={(e) => setF({ ...f, maxCpfs: e.target.value.replace(/\D/g, "").slice(0, 2) })} placeholder="Ex.: 2" aria-label="Até quantos CPFs" /></Field>
            <Field label="CPM a partir de"><input className="input" inputMode="decimal" value={f.minCpm} onChange={set("minCpm")} placeholder="R$ 0,00" aria-label="Milheiro a partir de" /></Field>
            <Field label="Milhas de"><input className="input" value={f.minMiles} onChange={set("minMiles")} placeholder="Ex.: 50k" aria-label="Milhas a partir de" /></Field>
            <Field label="Milhas até"><input className="input" value={f.maxMiles} onChange={set("maxMiles")} placeholder="Ex.: 300k" aria-label="Milhas até" /></Field>
            <Field label="Lucro a partir de"><input className="input" inputMode="decimal" value={f.minProfit} onChange={set("minProfit")} placeholder="R$ 0,00" aria-label="Lucro a partir de" /></Field>
            <Field label="Lucro por CPF a partir de"><input className="input" inputMode="decimal" value={f.minProfitCpf} onChange={set("minProfitCpf")} placeholder="R$ 0,00" aria-label="Lucro por CPF a partir de" /></Field>
          </div>
          {(f.minProfit || f.minProfitCpf) && <p className="text-xs text-muted">O lucro é pelo milheiro do pedido, com a sua conta mais barata que consegue emitir. Pedido sem preço ou que nenhuma conta sua consegue emitir não avisa.</p>}
          <Field label="Palavras (opcional, separe por vírgula)">
            <input className="input" value={f.words} onChange={set("words")} placeholder="Ex.: urgente" aria-label="Palavras do alerta" />
          </Field>
          <Field label="Nome (opcional)">
            <input className="input" value={f.name} onChange={set("name")} maxLength={80} placeholder="Ex.: Smiles para a conta da Ana" aria-label="Nome do alerta" />
          </Field>
          {(f.program || f.maxCpfs || f.minMiles || f.maxMiles || f.minCpm || f.minProfit || f.minProfitCpf || f.words) && (
            <p className="text-xs text-muted">Vai avisar de: {describeAlert({ words: parseAlertWords(f.words), program: f.program || null, maxCpfs: f.maxCpfs ? Number(f.maxCpfs) : null, minMiles: milesInput(f.minMiles) ?? null, maxMiles: milesInput(f.maxMiles) ?? null, minCpmCents: f.minCpm.trim() ? parseBRLToCents(f.minCpm) : null, minProfitCents: f.minProfit.trim() ? parseBRLToCents(f.minProfit) : null, minProfitPerCpfCents: f.minProfitCpf.trim() ? parseBRLToCents(f.minProfitCpf) : null }) || "—"}</p>
          )}
          <button className="btn-primary" disabled={busy}><Plus className="h-4 w-4" />Criar alerta</button>
        </form>
        <div className="card card-pad space-y-2">
          <p className="font-semibold">Seus alertas</p>
          {alerts.length === 0 ? <p className="text-sm text-muted">Nenhum alerta ainda.</p> : (
            <ul className="divide-y divide-line">
              {alerts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 py-2">
                  <input type="checkbox" checked={a.active} onChange={() => toggle(a)} aria-label={`Alerta ${a.name} ativo`} title={a.active ? "Ativo: clique para pausar" : "Pausado: clique para ativar"} />
                  <div className={`min-w-0 flex-1 ${a.active ? "" : "opacity-50"}`}>
                    <p className="truncate text-sm font-medium">{a.name}</p>
                    <p className="truncate text-xs text-muted" title={describeAlert(a)}>{describeAlert(a)}</p>
                  </div>
                  <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => remove(a)} aria-label={`Excluir alerta ${a.name}`}><Trash2 className="h-4 w-4" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="card card-pad space-y-2 text-sm">
          <p className="font-semibold">Avisos</p>
          <p className="text-xs text-muted">Com esta página aberta, o app confere os chats a cada 30 segundos e avisa quando chega mensagem com alerta.</p>
          {perm === "granted" ? <p className="text-xs text-ok">Avisos do navegador ligados.</p>
            : perm === "denied" ? <p className="text-xs text-muted">O navegador bloqueou os avisos deste site; libere nas configurações do navegador.</p>
            : perm === "unsupported" ? null
            : <button type="button" className="btn-ghost h-8 text-sm" onClick={askPermission}><BellRing className="h-4 w-4" />Ligar avisos do navegador</button>}
        </div>
      </div>
      <div className="card flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <p className="flex-1 font-semibold">Mensagens com alerta</p>
          <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => void reload()} aria-label="Atualizar agora" title="Atualizar agora"><RefreshCw className="h-4 w-4" /></button>
        </div>
        {errors.map((e) => <div key={e.chat} className="px-3 pt-3"><Alert>{e.chat}: {e.erro}</Alert></div>)}
        <div className="space-y-3 p-4">
          {!alerts.some((a) => a.active) ? <p className="text-sm text-muted">Crie um alerta para os pedidos que te interessam aparecerem aqui.</p>
            : feed === null ? <p className="text-sm text-muted">Procurando nos chats…</p>
            : feed.length === 0 ? <p className="text-sm text-muted">Nenhuma mensagem recente com os seus alertas.</p>
            : feed.map((m) => <Bubble key={`${m.chatId}:${m.id}`} m={m} chat={titleOf(m.chatId) || m.chat} onOpen={() => openChat(m.chatId)} onNegotiate={() => onNegotiate(m.chatId, m.id)} analysis={m.ad ? emissionAnalysis(m.ad, m.ad.cpmCents, accounts) : null} />)}
        </div>
      </div>
    </div>
  );
}
