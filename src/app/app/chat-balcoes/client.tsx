"use client";
// Chat Balcões: abas com as mensagens de cada grupo de balcão, as conversas no privado abertas a partir dos grupos e a
// aba Alertas. A tela pergunta por mensagens novas de tempos em tempos (só com a aba do navegador visível); mensagem
// que dispara um alerta fica destacada e avisa. Dá para mandar mensagem no grupo e no privado: o app só manda o que
// o usuário escreveu e mandou.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, BellRing, Copy, Plus, Settings, Trash2, RefreshCw, Send, MessageCircle, UserRound, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtDateTime, fmtPts, parseBRLToCents } from "@/lib/format";
import { Alert, Field } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { describeAlert, parseAlertWords, type AlertRule } from "@/domain/telegram-alerts";
import { BALCAO_PROGRAMS, type BalcaoAd } from "@/domain/balcao-ads";

type Chat = { id: string; title: string; account: string };
export type Dm = { id: string; linkId: string; name: string; username: string | null; via: string; group: string | null };
type Msg = { id: number; date: string; sender: string; text: string; media: string | null; out: boolean; fromUser: boolean; ad: BalcaoAd | null; alerts: string[] };
type FeedMsg = Msg & { chatId: string; chat: string };
/** O que a aba mostra: o grupo do balcão de uma conta ou uma conversa no privado. */
type Source = { kind: "group"; chat: Chat } | { kind: "dm"; dm: Dm };

const CHAT_POLL_MS = 15_000;
const FEED_POLL_MS = 30_000;
const ALERTS_TAB = "alertas";
const dmKey = (id: string) => `dm:${id}`;

/** Milhas digitadas: "100k", "100.000" ou "100000"; vazio = null; inválido = undefined. */
function milesInput(raw: string): number | null | undefined {
  const t = raw.trim().toLowerCase().replace(/\s/g, "");
  if (!t) return null;
  const k = t.match(/^(\d+(?:[.,]\d+)?)k$/);
  if (k) return Math.round(Number(k[1]!.replace(",", ".")) * 1000);
  return /^\d{1,3}(\.\d{3})*$|^\d+$/.test(t) ? Number(t.replace(/\./g, "")) : undefined;
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

export function ChatBalcoesClient({ chats, initialAlerts, initialDms }: { chats: Chat[]; initialAlerts: AlertRule[]; initialDms: Dm[] }) {
  const [tab, setTab] = useState(chats[0]!.id);
  const [dms, setDms] = useState(initialDms);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [feed, setFeed] = useState<FeedMsg[] | null>(null);
  const [feedErrors, setFeedErrors] = useState<{ chat: string; erro: string }[]>([]);
  const [unseen, setUnseen] = useState(0);
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
    setUnseen((n) => n + fresh.length);
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
  usePolling(loadFeed, FEED_POLL_MS, active);

  /** Chamar no privado quem mandou a mensagem do grupo: abre (ou volta para) a aba da conversa. */
  async function openDm(chatId: string, messageId: number) {
    const r = await api<{ item: Dm }>(`/api/telegram/accounts/${chatId}/dms`, "POST", { messageId });
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
      <button type="button" onClick={() => { setTab(key); if (key === ALERTS_TAB) setUnseen(0); }} aria-current={tab === key ? "page" : undefined} title={hint} className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm font-medium">{label}</button>
      {extra}
    </div>
  );
  return (
    <>
      <nav className="mb-4 flex gap-1 overflow-x-auto border-b border-line" aria-label="Chats dos balcões">
        {chats.map((c) => tabBtn(c.id, c.title, `pela conta ${c.account}`))}
        {dms.map((d) => tabBtn(dmKey(d.id), <><UserRound className="h-4 w-4" />{d.name}</>, `Privado pela conta ${d.via}`,
          <button type="button" onClick={() => closeDm(d)} className="-ml-1.5 mr-1 rounded p-0.5 text-muted hover:text-zinc-100" aria-label={`Fechar a conversa com ${d.name}`} title="Fechar aqui (no Telegram a conversa continua)"><X className="h-3.5 w-3.5" /></button>))}
        {tabBtn(ALERTS_TAB, <><Bell className="h-4 w-4" />Alertas{unseen > 0 && <span className="rounded-full bg-amber-500 px-1.5 text-[11px] font-bold text-black">{unseen}</span>}</>, `${alerts.filter((a) => a.active).length} ativos`)}
        <Link href="/app/settings?tab=telegram" className="ml-auto flex items-center gap-1 px-3 py-2 text-xs text-muted hover:text-zinc-100" title="Contas e grupos do Telegram"><Settings className="h-3.5 w-3.5" />Contas</Link>
      </nav>
      {/* os chats ficam montados: trocar de aba não perde o que já carregou */}
      {chats.map((c) => <div key={c.id} hidden={tab !== c.id}><ChatView source={{ kind: "group", chat: c }} visible={tab === c.id} onDm={(id) => openDm(c.id, id)} /></div>)}
      {dms.map((d) => <div key={d.id} hidden={tab !== dmKey(d.id)}><ChatView source={{ kind: "dm", dm: d }} visible={tab === dmKey(d.id)} /></div>)}
      {tab === ALERTS_TAB && <AlertsTab alerts={alerts} setAlerts={setAlerts} feed={feed} errors={feedErrors} chats={chats} openChat={setTab} reload={loadFeed} />}
    </>
  );
}

/** Mensagens de um grupo ou de uma conversa no privado: carrega as últimas e depois só as novas (de 15 em 15
 *  segundos, com a aba aberta), com o campo para mandar mensagem embaixo. */
function ChatView({ source, visible, onDm }: { source: Source; visible: boolean; onDm?: (messageId: number) => Promise<void> }) {
  const group = source.kind === "group";
  const url = group ? `/api/telegram/accounts/${source.chat.id}/messages` : `/api/telegram/dms/${source.dm.id}/messages`;
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [erro, setErro] = useState("");
  const [loading, setLoading] = useState(false);
  const [onlyAds, setOnlyAds] = useState(group); // grupo: só os pedidos (esconde contrapropostas e conversa)
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [opening, setOpening] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true); // rolando junto com as mensagens novas (o usuário não subiu para ler as antigas)
  const shown = msgs && onlyAds ? msgs.filter((m) => m.ad || m.out) : msgs;

  const load = useCallback(async () => {
    const last = msgs?.at(-1)?.id;
    setLoading(true);
    const r = await api<{ items: Msg[] }>(`${url}?limit=60${last ? `&minId=${last}` : ""}`);
    setLoading(false);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    if (!last) return setMsgs(r.data.items);
    if (r.data.items.length) setMsgs((cur) => [...(cur ?? []), ...r.data.items.filter((m) => m.id > last && !(cur ?? []).some((x) => x.id === m.id))]);
  }, [url, msgs]);

  useEffect(() => { if (visible && msgs === null) void load(); }, [visible, msgs, load]);
  usePolling(() => { if (msgs !== null) void load(); }, CHAT_POLL_MS, visible);
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [msgs, visible, onlyAds]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!text.trim() || sending) return;
    setSending(true);
    const r = await api<{ item: Msg }>(url, "POST", { text });
    setSending(false);
    if (!r.ok) return toast(r.erro, "error");
    setText("");
    stick.current = true;
    setMsgs((cur) => (cur?.some((m) => m.id === r.data.item.id) ? cur : [...(cur ?? []), r.data.item]));
  }
  async function dm(id: number) {
    if (!onDm) return;
    setOpening(id);
    await onDm(id);
    setOpening(null);
  }

  const title = group ? source.chat.title : `${source.dm.name}${source.dm.username ? ` (@${source.dm.username})` : ""}`;
  const subtitle = group
    ? `pela conta ${source.chat.account} · atualiza sozinho a cada 15 segundos${msgs ? ` · ${msgs.filter((m) => m.ad).length} pedidos em ${msgs.length} mensagens` : ""}`
    : `privado pela conta ${source.dm.via}${source.dm.group ? ` · do grupo ${source.dm.group}` : ""} · atualiza sozinho a cada 15 segundos`;
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
        <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => void load()} disabled={loading} aria-label="Atualizar agora" title="Atualizar agora"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></button>
      </div>
      {erro && <div className="p-3"><Alert>{erro}</Alert></div>}
      <div ref={box} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }} className="h-[58vh] space-y-2 overflow-y-auto p-4">
        {shown === null ? <p className="text-sm text-muted">Carregando as mensagens…</p>
          : shown.length === 0 ? <p className="text-sm text-muted">{onlyAds ? "Nenhum pedido nas últimas mensagens." : group ? "Nenhuma mensagem neste grupo." : "Nenhuma mensagem ainda: escreva abaixo para começar a conversa."}</p>
          : shown.map((m) => <Bubble key={m.id} m={m} onDm={group && m.fromUser && !m.out ? () => dm(m.id) : undefined} opening={opening === m.id} />)}
      </div>
      <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
        <textarea
          className="input min-h-10 flex-1 resize-none text-sm"
          rows={Math.min(5, Math.max(1, text.split("\n").length))}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
          maxLength={4096}
          placeholder={group ? `Mensagem para o grupo ${source.chat.title}` : `Mensagem para ${source.dm.name}`}
          aria-label={group ? "Mensagem para o grupo" : "Mensagem no privado"}
        />
        <button className="btn-primary h-10" disabled={sending || !text.trim()} title="Enviar (Enter; Shift+Enter quebra a linha)"><Send className="h-4 w-4" />{sending ? "Enviando…" : "Enviar"}</button>
      </form>
    </div>
  );
}

function Bubble({ m, chat, onOpen, onDm, opening }: { m: Msg; chat?: string; onOpen?: () => void; onDm?: () => void; opening?: boolean }) {
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
    <div className={`group rounded-xl border px-3 py-2 ${m.out ? "ml-auto max-w-[85%] border-accent-light/40 bg-accent-soft" : hit ? "border-amber-500/50 bg-amber-500/10" : "border-line bg-panel2"} ${m.out ? "" : "mr-auto"}`}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="truncate font-semibold text-zinc-200">{m.sender}</span>
        {chat && <button type="button" onClick={onOpen} className="truncate text-accent-light hover:underline">{chat}</button>}
        <span className="ml-auto shrink-0 text-muted">{when(m.date)}</span>
        {onDm && <button type="button" onClick={onDm} disabled={opening} className="flex shrink-0 items-center gap-1 text-accent-light opacity-70 hover:opacity-100 group-hover:opacity-100" title="Conversar no privado com quem mandou"><MessageCircle className="h-3.5 w-3.5" />{opening ? "Abrindo…" : "Privado"}</button>}
        {m.text && <button type="button" onClick={copy} className="shrink-0 text-muted opacity-0 hover:text-zinc-100 group-hover:opacity-100" aria-label="Copiar mensagem" title="Copiar"><Copy className="h-3.5 w-3.5" /></button>}
      </div>
      {m.ad && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs" aria-label="Pedido lido da mensagem">
          <span className={`rounded px-1.5 py-0.5 font-semibold ${m.ad.kind === "COMPRA" ? "bg-emerald-500/15 text-emerald-300" : "bg-sky-500/15 text-sky-300"}`}>{m.ad.kind === "COMPRA" ? "Compra" : "Venda"}</span>
          <span className="font-semibold text-zinc-100">{m.ad.program}</span>
          <span>{fmtPts(m.ad.miles)} milhas</span>
          <span>{m.ad.cpfs ?? 1} {(m.ad.cpfs ?? 1) === 1 ? "CPF" : "CPFs"}{m.ad.cpfs == null && <span className="text-muted"> (não disse)</span>}</span>
          <span className="font-semibold text-zinc-100">{m.ad.cpmCents != null ? `${fmtBRL(m.ad.cpmCents)} o milheiro` : "sem preço"}</span>
        </p>
      )}
      {m.media && <p className="mt-1 text-xs italic text-muted">[{m.media}]</p>}
      {m.text && <p className={`mt-1 whitespace-pre-wrap break-words ${m.ad ? "text-xs text-muted" : "text-sm"}`}>{m.text}</p>}
      {hit && <div className="mt-1.5 flex flex-wrap gap-1">{m.alerts.map((a) => <span key={a} className="flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-0.5 text-[11px] font-medium text-amber-200"><BellRing className="h-3 w-3" />{a}</span>)}</div>}
    </div>
  );
}

/** Aba Alertas: cadastrar as palavras e ver as mensagens de todos os chats que dispararam algum alerta. */
function AlertsTab({ alerts, setAlerts, feed, errors, chats, openChat, reload }: { alerts: AlertRule[]; setAlerts: (a: AlertRule[]) => void; feed: FeedMsg[] | null; errors: { chat: string; erro: string }[]; chats: Chat[]; openChat: (id: string) => void; reload: () => Promise<void> }) {
  const empty = { name: "", words: "", program: "", maxCpfs: "", minMiles: "", maxMiles: "", minCpm: "" };
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const [busy, setBusy] = useState(false);
  const [perm, setPerm] = useState(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const minMiles = milesInput(f.minMiles), maxMiles = milesInput(f.maxMiles);
    const minCpmCents = f.minCpm.trim() ? parseBRLToCents(f.minCpm) : null;
    if (minMiles === undefined || maxMiles === undefined) return toast("Milhas inválidas: use 100k, 100.000 ou 100000", "error");
    if (f.minCpm.trim() && !minCpmCents) return toast("Milheiro inválido", "error");
    const body = { name: f.name, words: parseAlertWords(f.words), program: f.program || null, maxCpfs: f.maxCpfs ? Number(f.maxCpfs) : null, minMiles, maxMiles, minCpmCents };
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
          </div>
          <Field label="Palavras (opcional, separe por vírgula)">
            <input className="input" value={f.words} onChange={set("words")} placeholder="Ex.: urgente" aria-label="Palavras do alerta" />
          </Field>
          <Field label="Nome (opcional)">
            <input className="input" value={f.name} onChange={set("name")} maxLength={80} placeholder="Ex.: Smiles para a conta da Ana" aria-label="Nome do alerta" />
          </Field>
          {(f.program || f.maxCpfs || f.minMiles || f.maxMiles || f.minCpm || f.words) && (
            <p className="text-xs text-muted">Vai avisar de: {describeAlert({ words: parseAlertWords(f.words), program: f.program || null, maxCpfs: f.maxCpfs ? Number(f.maxCpfs) : null, minMiles: milesInput(f.minMiles) ?? null, maxMiles: milesInput(f.maxMiles) ?? null, minCpmCents: f.minCpm.trim() ? parseBRLToCents(f.minCpm) : null }) || "—"}</p>
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
            : feed.map((m) => <Bubble key={`${m.chatId}:${m.id}`} m={m} chat={titleOf(m.chatId) || m.chat} onOpen={() => openChat(m.chatId)} />)}
        </div>
      </div>
    </div>
  );
}
