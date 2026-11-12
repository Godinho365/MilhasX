"use client";
// Chat Balcões: abas com as mensagens de cada grupo de balcão, as conversas no privado abertas a partir dos grupos e a
// aba Alertas. A tela pergunta por mensagens novas de tempos em tempos (só com a aba do navegador visível); mensagem
// que dispara um alerta fica destacada e avisa. Dá para mandar mensagem no grupo e no privado: o app só manda o que
// o usuário escreveu e mandou.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Copy, Plus, Settings, Trash2, RefreshCw, Send, MessageCircle, UserRound, X, Reply, CornerDownRight, Pencil, Check, Eraser, KanbanSquare, Handshake, Paperclip, Download, Users } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDateTime, fmtPts, parseBRLToCents } from "@/lib/format";
import { Alert, Field } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { describeAlert, parseAlertWords, type AlertRule } from "@/domain/telegram-alerts";
import { BALCAO_PROGRAMS, emissionAnalysis, parseBalcaoAd, parseCounterOffer, type BalcaoAd, type EmissionAccount } from "@/domain/balcao-ads";
import { DEAL_STAGE_LABELS, type DealStageKey } from "@/domain/miles-deals";
import { reportLatency, useRealtimeConnection, useRealtimeEvents, type RtEvent, type RtState } from "@/lib/realtime";

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
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const loadUnread = useCallback(async () => {
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

  const tabBtn = (key: string, label: React.ReactNode, hint: string, extra?: React.ReactNode) => (
    <div key={key} className={`-mb-px flex items-center border-b-2 ${tab === key ? "border-accent-light text-white" : "border-transparent text-muted hover:text-zinc-100"}`}>
      <button type="button" onClick={() => setTab(key)} aria-current={tab === key ? "page" : undefined} title={hint} className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium">{label}</button>
      {extra}
    </div>
  );
  return (
    <>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Chats dos balcões">
        {chats.map((c) => tabBtn(c.id, <>{c.title}{tab !== c.id && <Badge n={unread[c.id] ?? 0} />}</>, `pela conta ${c.account}`))}
        {dms.map((d) => tabBtn(dmKey(d.id), <><UserRound className="h-4 w-4" />{d.name}{tab !== dmKey(d.id) && <Badge n={unread[dmKey(d.id)] ?? 0} />}</>, `Privado pela conta ${d.via}${d.offer ? ` · contraproposta ao pedido do grupo ${d.offer.group}` : ""}`,
          <button type="button" onClick={() => closeDm(d)} className="-ml-1.5 mr-1 rounded p-0.5 text-muted hover:text-zinc-100" aria-label={`Fechar a conversa com ${d.name}`} title="Fechar aqui (no Telegram a conversa continua)"><X className="h-3.5 w-3.5" /></button>))}
        {tabBtn(ALERTS_TAB, <><Bell className="h-4 w-4" />Alertas{tab !== ALERTS_TAB && <Badge n={unseenAlerts} tone="amber" />}</>, `${alerts.filter((a) => a.active).length} ativos`)}
        <LiveBadge realtime={realtime} state={rt.state} links={rt.links} />
        <Link href="/app/settings?tab=telegram" className="flex items-center gap-1 px-3 py-2 text-xs text-muted hover:text-zinc-100" title="Contas e grupos do Telegram"><Settings className="h-3.5 w-3.5" />Contas</Link>
      </nav>
      {/* os chats ficam montados: trocar de aba não perde o que já carregou */}
      {chats.map((c) => <div key={c.id} hidden={tab !== c.id}><ChatView source={{ kind: "group", chat: c }} visible={tab === c.id} onDm={(id) => openDm(c.id, id)} onOfferDm={offerDm} onSeen={(upTo) => markSeen(c.id, `/api/telegram/chats/${c.id}/seen`, upTo)} focus={focus?.chatId === c.id ? focus : null} accounts={accounts} realtime={realtime} live={live} /></div>)}
      {dms.map((d) => <div key={d.id} hidden={tab !== dmKey(d.id)}><ChatView source={{ kind: "dm", dm: d }} visible={tab === dmKey(d.id)} onSeen={(upTo) => markSeen(dmKey(d.id), `/api/telegram/dms/${d.id}/seen`, upTo)} onGoToGroup={goToGroup} accounts={accounts} realtime={realtime} live={live} /></div>)}
      {tab === ALERTS_TAB && <AlertsTab alerts={alerts} setAlerts={setAlerts} feed={feed} errors={feedErrors} chats={chats} openChat={setTab} reload={loadFeed} accounts={accounts} onNegotiate={negotiate} />}
    </>
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
    <span className="ml-auto flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs text-muted" title={hint} role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${tone}`} aria-hidden />{label}
    </span>
  );
}

/** Mensagens de um grupo ou de uma conversa no privado: carrega as últimas e depois só as novas (de 15 em 15
 *  segundos, com a aba aberta), com o campo para mandar mensagem embaixo. No grupo, cada pedido mostra o lucro de
 *  atendê-lo pela sua conta mais barata que consegue emitir (sem conta com saldo, não mostra). */
function ChatView({ source, visible, onDm, onOfferDm, onSeen, onGoToGroup, focus, accounts = [], realtime = false, live = false }: { source: Source; visible: boolean; onDm?: (messageId: number) => Promise<void>; onOfferDm?: (dm: Dm) => void; onSeen?: (upTo: number) => void; onGoToGroup?: (chatId: string, messageId: number) => void; focus?: { id: number; n: number; reply?: boolean } | null; accounts?: EmissionAccount[]; realtime?: boolean; live?: boolean }) {
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
  const refresh = live ? "em tempo real" : "atualiza sozinho a cada 15 segundos";
  const subtitle = group
    ? `pela conta ${source.chat.account} · ${refresh}${msgs ? ` · ${msgs.filter((m) => m.ad).length} pedidos em ${msgs.length} mensagens` : ""}`
    : `privado pela conta ${source.dm.via}${source.dm.group ? ` · do grupo ${source.dm.group}` : ""} · ${refresh}`;
  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{title}</p>
          <p className="truncate text-xs text-muted">{subtitle}</p>
        </div>
        {group && (
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted" title="Esconde as contrapropostas e a conversa">
            <input type="checkbox" checked={onlyAds} onChange={(e) => setOnlyAds(e.target.checked)} />Só pedidos
          </label>
        )}
        <button type="button" className="btn-subtle h-8 gap-1 px-2 text-xs" onClick={clearChat} disabled={!msgs?.length} aria-label="Limpar o chat aqui" title="Limpa só aqui no app; no Telegram as mensagens continuam"><Eraser className="h-4 w-4" />Limpar</button>
        <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => void load()} disabled={loading} aria-label="Atualizar agora" title="Atualizar agora"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
      {cleared != null && (
        <div className="flex items-center gap-2 border-b border-line bg-panel2 px-4 py-1.5 text-xs text-muted">
          <Eraser className="h-3.5 w-3.5" />Chat limpo aqui: aparecem só as mensagens novas.
          <button type="button" onClick={showAgain} className="font-medium text-accent-light hover:underline">Mostrar de novo</button>
        </div>
      )}
      {source.kind === "dm" && source.dm.offer && <OfferStrip offer={source.dm.offer} cpmCents={liveOffer ?? source.dm.offer.cpmCents} accounts={accounts} initialCrm={source.dm.crm} onGoToGroup={onGoToGroup} />}
      {erro && <div className="p-3"><Alert>{erro}</Alert></div>}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="h-[58vh] space-y-2 overflow-y-auto p-4">
        {shown === null ? <p className="text-sm text-muted">Carregando as mensagens…</p>
          : shown.length === 0 ? <p className="text-sm text-muted">{cleared != null && !msgs?.length ? "Chat limpo. As mensagens novas aparecem aqui." : onlyAds ? "Nenhum pedido nas últimas mensagens." : group ? "Nenhuma mensagem neste grupo." : "Nenhuma mensagem ainda: escreva abaixo para começar a conversa."}</p>
          : shown.map((m) => (
            <Bubble key={m.id} domId={msgDomId(url, m.id)} m={m} mediaBase={url.replace(/\/messages$/, "")} quoted={m.replyTo ? byId.get(m.replyTo) ?? null : undefined} replying={replying?.id === m.id || editing?.id === m.id} flash={flash === m.id} fresh={fresh.has(m.id)} offers={m.ad ? offersOf(m) : undefined}
              analysis={m.ad ? emissionAnalysis(m.ad, m.ad.cpmCents, accounts) : null}
              profitAt={m.ad ? (cents) => emissionAnalysis(m.ad!, cents, accounts) : undefined}
              onCrm={group && m.ad ? (cents) => registerCrm(m, cents) : undefined} registering={registering === m.id}
              onReply={() => reply(m)} onDm={group && m.fromUser && !m.out ? () => dm(m.id) : undefined} opening={opening === m.id}
              onGroup={!group && m.origin && onGoToGroup ? () => onGoToGroup(m.origin!.chatId, m.origin!.messageId) : undefined}
              onEdit={m.out && m.text && !m.fwd ? () => edit(m) : undefined} onDelete={m.out ? () => remove(m) : undefined}
              onEditOffer={edit} onDeleteOffer={remove} editingId={editing?.id}
              read={!group && m.out ? m.id <= readMax : undefined} />
          ))}
      </div>
      <form onSubmit={send} className="border-t border-line p-3">
        {(replying || editing) && (
          <div className="mb-2 flex items-center gap-2 rounded-lg border-l-2 border-accent-light bg-panel2 px-3 py-1.5 text-xs">
            {editing ? <Pencil className="h-3.5 w-3.5 shrink-0 text-accent-light" /> : <Reply className="h-3.5 w-3.5 shrink-0 text-accent-light" />}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-accent-light">
                {editing ? (target?.ad ? `Editando a sua contraproposta para ${target.sender}` : "Editando a sua mensagem") : replying!.ad ? `Contraproposta para ${replying!.sender}` : `Respondendo a ${replying!.sender}`}
              </p>
              <p className="truncate text-muted">{target ? quote(target) : quote((editing ?? replying)!)}</p>
              {/* lucro com o valor digitado (some quando nenhuma conta sua consegue emitir) */}
              {typedProfit && <div className="mt-0.5 flex items-center gap-1.5"><span className="text-muted">Com {fmtBRL(typedCents!)}:</span><AnalysisLine a={typedProfit} compact /></div>}
            </div>
            <button type="button" onClick={cancel} className="shrink-0 rounded p-0.5 text-muted hover:text-zinc-100" aria-label={editing ? "Cancelar a edição" : replying!.ad ? "Cancelar a contraproposta" : "Cancelar a resposta"} title="Cancelar (Esc)"><X className="h-4 w-4" /></button>
          </div>
        )}
        {source.kind === "group" && replying?.ad && onOfferDm && !editing && (
          <label className="mb-2 flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={alsoPrivate} onChange={(e) => setAlsoPrivate(e.target.checked)} className="h-3.5 w-3.5 accent-accent-light" />
            Mandar também no privado de <b className="text-zinc-200">{replying.sender}</b>
          </label>
        )}
        <div className="flex items-end gap-2">
          <input ref={fileInput} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void sendAttachment(f); }} aria-label="Anexar arquivo" />
          {!editing && <button type="button" className="btn-ghost h-10 shrink-0 px-2" onClick={() => fileInput.current?.click()} disabled={uploading} title="Enviar foto, print ou PDF" aria-label="Enviar foto, print ou PDF"><Paperclip className="h-4 w-4" /></button>}
          <textarea
            ref={input}
            className="input min-h-10 flex-1 resize-none text-sm"
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
          <button className="btn-primary h-10" disabled={sending || !text.trim()} title="Enviar (Enter; Shift+Enter quebra a linha)">
            {editing ? <Check className="h-4 w-4" /> : <Send className="h-4 w-4" />}{sending ? "Enviando…" : editing ? "Salvar" : replying ? "Responder" : "Enviar"}
          </button>
        </div>
      </form>
    </div>
  );
}

type Analysis = ReturnType<typeof emissionAnalysis>;

/** No privado: o pedido do grupo a que a conversa está ligada, a sua contraproposta e o lucro por ela. */
function OfferStrip({ offer, cpmCents, accounts, initialCrm, onGoToGroup }: { offer: DmOffer; cpmCents: number | null; accounts: EmissionAccount[]; initialCrm?: CrmRef | null; onGoToGroup?: (chatId: string, messageId: number) => void }) {
  const ad = offer.text ? parseBalcaoAd(offer.text) : null;
  const [crm, setCrm] = useState(initialCrm ?? null);
  const [registering, setRegistering] = useState(false);
  // já tem negociação com conta escolhida: o lucro é o DESSA conta; senão, a sugestão pela regra
  const dealAccount = crm?.accountId ? accounts.filter((a) => a.id === crm.accountId) : [];
  const profit = ad ? emissionAnalysis(ad, cpmCents, dealAccount.length ? dealAccount : accounts) : null;
  /** Registra o pedido no CRM Milhas com o milheiro da sua contraproposta (sem ela, o do pedido). */
  async function register() {
    setRegistering(true);
    const r = await api<{ item: CrmRef }>(`/api/telegram/chats/${offer.chatId}/crm`, "POST", { messageId: offer.messageId, text: offer.text, sender: offer.sender, cpmCents: cpmCents ?? null });
    setRegistering(false);
    if (!r.ok) return toast(r.erro, "error");
    setCrm({ id: r.data.item.id, number: r.data.item.number, stage: r.data.item.stage, accountId: r.data.item.accountId });
    toast(`Negociação #${r.data.item.number} registrada no CRM Milhas`);
  }
  return (
    <div className="space-y-0.5 border-b border-line bg-panel2 px-4 py-2 text-xs" aria-label="Pedido desta conversa">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <KanbanSquare className="h-3.5 w-3.5 shrink-0 text-accent-light" />
        <span className="text-muted">Pedido de <b className="text-zinc-200">{offer.sender}</b> no grupo {offer.group} · {when(offer.at)}</span>
        {ad && <span className="font-semibold text-zinc-100">{ad.program} · {fmtPts(ad.miles)} milhas · {ad.cpfs ?? 1} {(ad.cpfs ?? 1) === 1 ? "CPF" : "CPFs"}{ad.cpmCents != null ? ` · pediu ${fmtBRL(ad.cpmCents)}` : ""}</span>}
        {cpmCents != null && <span className="rounded bg-accent-soft px-1.5 py-0.5 font-semibold text-accent-light">Sua contraproposta {fmtBRL(cpmCents)}</span>}
        {onGoToGroup && <button type="button" onClick={() => onGoToGroup(offer.chatId, offer.messageId)} className="flex shrink-0 items-center gap-1 font-medium text-accent-light hover:underline" title={`Ir para o pedido no grupo ${offer.group}`}><Users className="h-3.5 w-3.5" />Ver no grupo</button>}
        {crm
          ? <Link href={`/app/crm-milhas?deal=${crm.id}`} className="ml-auto flex shrink-0 items-center gap-1 font-medium text-emerald-300 hover:underline" title="Abrir a negociação no CRM Milhas"><KanbanSquare className="h-3.5 w-3.5" />No CRM #{crm.number} · {DEAL_STAGE_LABELS[crm.stage as DealStageKey] ?? crm.stage}</Link>
          : ad && <button type="button" onClick={register} disabled={registering} className="ml-auto flex shrink-0 items-center gap-1 font-medium text-accent-light hover:underline" title={`Registrar no CRM Milhas${cpmCents != null ? ` com ${fmtBRL(cpmCents)} o milheiro (a sua contraproposta)` : ""}`}><KanbanSquare className="h-3.5 w-3.5" />{registering ? "Registrando…" : "CRM"}</button>}
      </p>
      {profit && <AnalysisLine a={profit} compact />}
      {!ad && offer.text && <p className="truncate text-muted">{offer.text}</p>}
    </div>
  );
}

/** Uma mensagem. quoted: a mensagem respondida (null = ela não está entre as carregadas; undefined = não é resposta);
 *  offers: as contrapropostas ao pedido; analysis: a análise do pedido pelas regras da negociação (conta, saldo e
 *  CPFs depois, sobra e lucro); profitAt: o lucro por outro milheiro (o da sua contraproposta); onCrm: registra. */
function Bubble({ m, domId, chat, mediaBase, onOpen, onNegotiate, onDm, opening, onReply, replying, flash, fresh, onGroup, quoted, offers, analysis, profitAt, onEdit, onDelete, onEditOffer, onDeleteOffer, editingId, onCrm, registering, read }: {
  m: Msg; domId?: string; chat?: string; mediaBase?: string; onOpen?: () => void; onNegotiate?: () => void; onDm?: () => void; opening?: boolean; onReply?: () => void; replying?: boolean; flash?: boolean; fresh?: boolean; onGroup?: () => void; quoted?: Msg | null; offers?: Msg[];
  analysis?: Analysis; profitAt?: (cpmCents: number) => Analysis; onEdit?: () => void; onDelete?: () => void; onEditOffer?: (m: Msg) => void; onDeleteOffer?: (m: Msg) => void; editingId?: number;
  onCrm?: (cpmCents?: number) => void; registering?: boolean; read?: boolean; // privado: true = visualizada (verde), false = entregue (amarelo), undefined = não mostra
}) {
  const hit = m.alerts.length > 0;
  async function copy() {
    try {
      await navigator.clipboard.writeText(m.text);
      toast("Mensagem copiada");
    } catch {
      toast("Não deu para copiar", "error");
    }
  }
  return (
    <div id={domId} className={`group scroll-mt-4 rounded-xl border px-3 py-2 ${m.out ? "ml-auto max-w-[85%] border-accent-light/40 bg-accent-soft" : hit ? "border-amber-500/50 bg-amber-500/10" : "border-line bg-panel2"} ${m.out ? "" : "mr-auto"} ${replying ? "ring-2 ring-accent-light" : flash ? "ring-2 ring-amber-400" : fresh ? "ring-2 ring-emerald-400/70" : ""} transition-shadow duration-700`}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="truncate font-semibold text-zinc-200">{m.sender}</span>
        {chat && <button type="button" onClick={onOpen} className="truncate text-accent-light hover:underline">{chat}</button>}
        <span className="ml-auto shrink-0 text-muted">{when(m.date)}</span>
        {read !== undefined && <span className="inline-flex shrink-0" title={read ? "Visualizada pela pessoa" : "Entregue — ainda não visualizada"} aria-label={read ? "Visualizada" : "Entregue"}><Check className={`h-5 w-5 ${read ? "text-emerald-400" : "text-amber-400"}`} strokeWidth={3.5} /></span>}
        {onNegotiate && <button type="button" onClick={onNegotiate} className="flex shrink-0 items-center gap-1 font-medium text-accent-light hover:underline" title="Ir para o pedido no chat e mandar a contraproposta"><Handshake className="h-3.5 w-3.5" />Negociação</button>}
        {onGroup && <button type="button" onClick={onGroup} className="flex shrink-0 items-center gap-1 font-medium text-accent-light opacity-90 hover:opacity-100" title="Ir para este pedido no grupo"><Users className="h-3.5 w-3.5" />Ver no grupo</button>}
        {onReply && <button type="button" onClick={onReply} className="flex shrink-0 items-center gap-1 font-medium text-accent-light opacity-90 hover:opacity-100" aria-label={m.ad ? `Contraproposta para ${m.sender}` : `Responder ${m.sender}`} title={m.ad ? "Mandar a sua contraproposta como resposta a este pedido" : "Responder esta mensagem"}><Reply className="h-3.5 w-3.5" />{m.ad ? "Contraproposta" : "Responder"}</button>}
        {m.crm
          ? <Link href={`/app/crm-milhas?deal=${m.crm.id}`} className="flex shrink-0 items-center gap-1 font-medium text-emerald-300 hover:underline" title="Abrir a negociação no CRM Milhas"><KanbanSquare className="h-3.5 w-3.5" />No CRM #{m.crm.number} · {DEAL_STAGE_LABELS[m.crm.stage as DealStageKey] ?? m.crm.stage}</Link>
          : onCrm && <button type="button" onClick={() => onCrm()} disabled={registering} className="flex shrink-0 items-center gap-1 text-accent-light opacity-80 hover:opacity-100" title="Registrar este pedido no CRM Milhas (com o milheiro do pedido)"><KanbanSquare className="h-3.5 w-3.5" />{registering ? "Registrando…" : "CRM"}</button>}
        {onDm && <button type="button" onClick={onDm} disabled={opening} className="flex shrink-0 items-center gap-1 text-accent-light opacity-70 hover:opacity-100 group-hover:opacity-100" title="Conversar no privado com quem mandou"><MessageCircle className="h-3.5 w-3.5" />{opening ? "Abrindo…" : "Privado"}</button>}
        {onEdit && <button type="button" onClick={onEdit} className="shrink-0 text-muted hover:text-zinc-100" aria-label="Editar a sua mensagem" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>}
        {onDelete && <button type="button" onClick={onDelete} className="shrink-0 text-muted hover:text-red-300" aria-label="Excluir a sua mensagem" title="Excluir para todos"><Trash2 className="h-3.5 w-3.5" /></button>}
        {m.text && <button type="button" onClick={copy} className="shrink-0 text-muted opacity-0 hover:text-zinc-100 group-hover:opacity-100" aria-label="Copiar mensagem" title="Copiar"><Copy className="h-3.5 w-3.5" /></button>}
      </div>
      {quoted !== undefined && (
        <p className="mt-1 flex items-center gap-1 truncate rounded border-l-2 border-line bg-black/10 px-2 py-0.5 text-[11px] text-muted">
          <CornerDownRight className="h-3 w-3 shrink-0" />{quoted ? <><b className="font-semibold text-zinc-300">{quoted.sender}:</b> {quote(quoted)}</> : "resposta a uma mensagem mais antiga"}
        </p>
      )}
      {m.ad && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" aria-label="Pedido lido da mensagem">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${m.ad.kind === "COMPRA" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>{m.ad.kind === "COMPRA" ? "Compra" : "Venda"}</span>
          <span className="font-semibold text-zinc-100">{m.ad.program}</span>
          <span>{fmtPts(m.ad.miles)} milhas</span>
          <span>{m.ad.cpfs ?? 1} {(m.ad.cpfs ?? 1) === 1 ? "CPF" : "CPFs"}{m.ad.cpfs == null && <span className="text-muted"> (não disse)</span>}</span>
          <span className="font-semibold text-zinc-100">{m.ad.cpmCents != null ? `${fmtBRL(m.ad.cpmCents)} o milheiro` : "sem preço"}</span>
        </p>
      )}
      {m.ad && analysis && <AnalysisLine a={analysis} />}
      {m.media && (
        m.mediaKind === "photo" && mediaBase ? (
          <a href={`${mediaBase}/media/${m.id}`} target="_blank" rel="noreferrer" className="mt-1 block w-fit" title="Abrir a imagem em tamanho cheio">
            <img src={`${mediaBase}/media/${m.id}`} alt={m.mediaName ?? "foto"} loading="lazy" className="max-h-64 max-w-full rounded-lg border border-line object-contain" />
          </a>
        ) : m.mediaKind === "file" && mediaBase ? (
          <a href={`${mediaBase}/media/${m.id}`} download={m.mediaName ?? undefined} className="mt-1 flex w-fit max-w-full items-center gap-2 rounded-lg border border-line bg-black/10 px-2.5 py-1.5 text-xs font-medium text-accent-light hover:bg-black/20" title="Baixar o arquivo">
            <Paperclip className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{m.mediaName ?? m.media}</span>
            <Download className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </a>
        ) : (
          <p className="mt-1 text-xs italic text-muted">[{m.media}]</p>
        )
      )}
      {m.text && <p className={`mt-1 whitespace-pre-wrap break-words ${m.ad ? "text-xs text-muted" : "text-sm"}`}>{m.text}</p>}
      {hit && <div className="mt-1.5 flex flex-wrap gap-1">{m.alerts.map((a) => <span key={a} className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-300"><BellRing className="h-3 w-3" />{a}</span>)}</div>}
      {offers && offers.length > 0 && <Offers offers={offers} onEdit={onEditOffer} onDelete={onDeleteOffer} editingId={editingId} profitAt={profitAt} onCrm={m.crm ? undefined : onCrm} registering={registering} />}
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
    <div className="mt-2 rounded-lg border border-line bg-black/10 px-2.5 py-1.5" aria-label="Contrapropostas">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted">
        {offers.length} {offers.length === 1 ? "contraproposta" : "contrapropostas"}{best != null && <span className="normal-case tracking-normal"> · menor {fmtBRL(best)}</span>}
      </p>
      <ul className="space-y-0.5">
        {visible.map(({ o, cents }) => {
          const mine = o.out && cents != null && profitAt ? profitAt(cents) : null; // o lucro pelo seu preço
          return (
            <li key={`${o.group ? "g" : "m"}${o.id}`} className={`text-xs ${o.out ? "font-semibold text-accent-light" : ""} ${!o.group && editingId === o.id ? "rounded bg-accent-soft" : ""}`}>
              <div className="flex items-baseline gap-2">
                <span className={`w-20 shrink-0 tabular-nums ${cents != null && cents === best ? "font-semibold text-emerald-300" : "text-zinc-100"}`}>{cents != null ? fmtBRL(cents) : "—"}</span>
                <span className="min-w-0 flex-1 truncate" title={o.group ? `${o.text} (no grupo)` : o.text}>{o.sender}{o.group && <span className="ml-1 rounded bg-zinc-500/20 px-1 text-[10px] font-normal text-muted">no grupo</span>}{cents == null || o.text.replace(/[\d\s.,?r$]/gi, "").length > 0 ? <span className="text-muted"> · {o.text.replace(/\s+/g, " ").slice(0, 60)}</span> : null}</span>
                {o.out && cents != null && onCrm && <button type="button" onClick={() => onCrm(cents)} disabled={registering} className="flex shrink-0 items-center gap-1 self-center font-medium text-accent-light hover:underline" title="Registrar no CRM Milhas com o milheiro da sua contraproposta"><KanbanSquare className="h-3.5 w-3.5" />{registering ? "Registrando…" : "CRM"}</button>}
                {o.out && onEdit && <button type="button" onClick={() => onEdit(o)} className="shrink-0 self-center text-muted hover:text-zinc-100" aria-label="Editar a sua contraproposta" title="Editar a sua contraproposta"><Pencil className="h-3.5 w-3.5" /></button>}
                {o.out && onDelete && <button type="button" onClick={() => onDelete(o)} className="shrink-0 self-center text-muted hover:text-red-300" aria-label="Excluir a sua contraproposta" title="Excluir a sua contraproposta"><Trash2 className="h-3.5 w-3.5" /></button>}
                <span className="shrink-0 font-normal text-muted">{when(o.date)}</span>
              </div>
              {mine && <div className="mb-1 ml-[5.5rem] font-normal"><AnalysisLine a={mine} compact /></div>}
            </li>
          );
        })}
      </ul>
      {rows.length > visible.length && <button type="button" onClick={() => setAll(true)} className="mt-0.5 text-[11px] text-accent-light hover:underline">Ver todas ({rows.length})</button>}
      {all && rows.length > 5 && <button type="button" onClick={() => setAll(false)} className="mt-0.5 text-[11px] text-accent-light hover:underline">Mostrar menos</button>}
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
    <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
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
        <div className="max-h-[65vh] space-y-2 overflow-y-auto p-4">
          {!alerts.some((a) => a.active) ? <p className="text-sm text-muted">Crie um alerta para os pedidos que te interessam aparecerem aqui.</p>
            : feed === null ? <p className="text-sm text-muted">Procurando nos chats…</p>
            : feed.length === 0 ? <p className="text-sm text-muted">Nenhuma mensagem recente com os seus alertas.</p>
            : feed.map((m) => <Bubble key={`${m.chatId}:${m.id}`} m={m} chat={titleOf(m.chatId) || m.chat} onOpen={() => openChat(m.chatId)} onNegotiate={() => onNegotiate(m.chatId, m.id)} analysis={m.ad ? emissionAnalysis(m.ad, m.ad.cpmCents, accounts) : null} />)}
        </div>
      </div>
    </div>
  );
}
