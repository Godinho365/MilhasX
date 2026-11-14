"use client";
// Balcão MilhasX: vincular com o código do bot (/milhasx), ver as ofertas abertas (com a análise de emissão das suas
// contas) e mandar proposta: aceitar o valor do comprador ou contrapropor. Em tempo real: o servidor confere o Balcão
// a cada 2 s e manda o que mudou pelo WebSocket (/ws), e a tela só aplica; sem o tempo real, confere a cada minuto. A
// proposta só entra no CRM Milhas quando o comprador a escolhe (em Aguardando) e anda sozinha dali em diante.
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, Link2, MessageCircle, RefreshCw, Unlink, ExternalLink, ShieldCheck, Zap, BadgeCheck, Star } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtPts, fmtDateTime, parseBRLToCents } from "@/lib/format";
import { Alert, Empty, SegmentedButtons } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { DEAL_STAGE_LABELS } from "@/domain/miles-deals";
import { useRealtimeConnection, useRealtimeEvents } from "@/lib/realtime";
import { BuyPanel } from "./buy";
import { DealInline, DealsPanel } from "./deals";
import { ClosedSection, useHidden } from "./closed";

type Status = {
  enabled: boolean; linked: boolean; linkedAt: string | null; syncedAt: string | null;
  member: { name: string | null; username: string | null; role: string | null; canView: boolean; canSell: boolean } | null;
};
type Deal = { id: string; number: number; stage: keyof typeof DEAL_STAGE_LABELS; archived: boolean } | null;
type Proposal = { id: number; oferta_id: number; valor_centavos: number; contraproposta: boolean; status: "pending" | "chosen" | "rejected"; atualizada_em: string | null };
type Analysis = { account: string; covers: boolean; costCpmCents: number; profitCents: number | null; missingMiles: number; cpfShort: boolean } | null;
type Offer = {
  id: number; status: string; programa: string; programa_nome: string; milhas: number; cpfs: number; milheiro_centavos: number;
  total_centavos: number; urgente: boolean; intermediada: boolean; observacao: string | null; valida_ate: string; sua_oferta: boolean;
  comprador: { perfil: string | null; verificado: boolean; negociacoes: number; nota: number | null; avaliacoes: number };
  link_bot: string | null; analysis: Analysis; myProposal: Proposal | null; deal: Deal;
};
type MyProposal = Proposal & { oferta: Omit<Offer, "analysis" | "myProposal" | "deal">; deal: Deal };

const PROGRAMS: [string, string][] = [
  ["", "Todos os programas"], ["latam", "Latam Pass"], ["smiles", "Smiles"], ["azul", "Azul Fidelidade"], ["azul_mundo", "Azul pelo Mundo"],
  ["iberia", "Iberia Plus"], ["tap", "TAP Miles&Go"], ["aadvantage", "AAdvantage"], ["flyingblue", "Flying Blue"],
];
const ROLE: Record<string, string> = { viajante: "Viajante", agente: "Agência", milheiro: "Milheiro" };
const PROPOSAL: Record<Proposal["status"], [string, string]> = {
  pending: ["Aguardando o comprador", "text-amber-300"], chosen: ["Escolhida", "text-green-300"], rejected: ["Recusada", "text-muted"],
};
const OFFER_STATUS: Record<string, string> = {
  open: "Aberta", awaiting_payment: "Aguardando pagamento", matched: "Em negociação", completed: "Concluída", cancelled: "Cancelada", expired: "Expirada",
};
const SYNC_EVERY_MS = 60_000;

export function BalcaoClient({ initial, canEdit, realtime }: { initial: Status; canEdit: boolean; realtime: boolean }) {
  const [status, setStatus] = useState(initial);
  if (!status.linked) return <LinkForm onLinked={setStatus} canEdit={canEdit} />;
  return <Linked status={status} setStatus={setStatus} canEdit={canEdit} realtime={realtime} />;
}

function LinkForm({ onLinked, canEdit }: { onLinked: (s: Status) => void; canEdit: boolean }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api<{ item: Status }>("/api/balcao", "POST", { code });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast("Conta do Balcão vinculada");
    onLinked(r.data.item);
  }
  return (
    <Empty title="Vincule sua conta do Balcão" icon={<Handshake className="h-5 w-5" />}>
      <ol className="max-w-md list-decimal space-y-1 pl-5 text-left text-sm text-muted">
        <li>No bot do Balcão, no Telegram, mande <b className="text-zinc-100">/milhasx</b>.</li>
        <li>Copie o código que o bot responde (vale 10 minutos).</li>
        <li>Cole aqui e toque em Vincular.</li>
      </ol>
      {canEdit ? (
        <form onSubmit={submit} className="mt-2 flex w-full max-w-sm gap-2">
          <input className="input tracking-widest uppercase" value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABCD-EF23" maxLength={12} required aria-label="Código do bot do Balcão" autoComplete="off" />
          <button className="btn-primary" disabled={busy}><Link2 className="h-4 w-4" />{busy ? "Vinculando…" : "Vincular"}</button>
        </form>
      ) : (
        <p className="text-sm text-muted">Peça ao dono da conta para vincular o Balcão.</p>
      )}
    </Empty>
  );
}

function Linked({ status, setStatus, canEdit, realtime }: { status: Status; setStatus: (s: Status) => void; canEdit: boolean; realtime: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"ofertas" | "propostas" | "comprar" | "negociacoes">("ofertas");
  const [program, setProgram] = useState("");
  const [offers, setOffers] = useState<Offer[] | null>(null);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [mine, setMine] = useState<MyProposal[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const rt = useRealtimeConnection(realtime);
  const live = rt.state === "live";
  const m = status.member!;
  // o status muda a cada sincronização: lido por ref, para as funções abaixo não mudarem (e não recarregarem tudo)
  const statusRef = useRef(status);
  statusRef.current = status;
  const tabRef = useRef(tab);
  tabRef.current = tab;
  const programRef = useRef(program);
  programRef.current = program;

  const lost = useCallback((r: { status: number; erro: string }) => {
    if (r.status === 409 && /vincul/i.test(r.erro)) { // vínculo desfeito no Balcão: volta para a tela de vincular
      toast(r.erro, "error");
      setStatus({ ...statusRef.current, linked: false, member: null });
      return true;
    }
    return false;
  }, [setStatus]);

  const loadOffers = useCallback(async (p = 1) => {
    const prog = programRef.current;
    const q = new URLSearchParams({ pagina: String(p), ...(prog ? { programa: prog } : {}) });
    const r = await api<{ item: { offers: Offer[]; more: boolean; page: number } }>(`/api/balcao/offers?${q}`);
    if (!r.ok) { if (!lost(r)) setError(r.erro); return; }
    setError(null);
    setOffers((prev) => (p === 1 ? r.data.item.offers : [...(prev ?? []), ...r.data.item.offers]));
    setMore(r.data.item.more);
    setPage(p);
  }, [lost]);

  const loadMine = useCallback(async () => {
    const r = await api<{ items: MyProposal[] }>("/api/balcao/proposals");
    if (!r.ok) { if (!lost(r)) setError(r.erro); return; }
    setError(null);
    setMine(r.data.items);
  }, [lost]);

  const sync = useCallback(async (manual = false) => {
    setSyncing(true);
    const r = await api<{ item: { moved: number; status: Status } }>("/api/balcao/sync", "POST");
    setSyncing(false);
    if (!r.ok) { if (!lost(r) && manual) toast(r.erro, "error"); return; }
    setStatus(r.data.item.status);
    if (r.data.item.moved) toast(`${r.data.item.moved} negociação(ões) do CRM Milhas atualizada(s) pelo Balcão`);
  }, [lost, setStatus]);

  const reload = useCallback(async () => {
    if (tabRef.current === "ofertas") await loadOffers(1);
    else if (tabRef.current === "propostas") await loadMine();
  }, [loadOffers, loadMine]); // "comprar" e "negociacoes": cada aba carrega o que é dela
  const refresh = useCallback(async (manual = false) => {
    await sync(manual);
    await reload();
  }, [sync, reload]);

  // ao abrir: sincroniza uma vez; ao trocar de aba ou de programa: só a lista
  useEffect(() => { void sync(); }, [sync]);
  useEffect(() => { void reload(); }, [tab, program, reload]);
  // sem o tempo real (desligado ou caiu): confere a cada minuto enquanto a aba está visível
  useEffect(() => {
    if (live) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, SYNC_EVERY_MS);
    return () => clearInterval(t);
  }, [live, refresh]);
  // o tempo real voltou depois de cair: pode ter perdido algo, recarrega a lista
  const wasLive = useRef(false);
  useEffect(() => {
    if (live && wasLive.current === false && offers !== null) void reload();
    wasLive.current = live;
  }, [live]); // eslint-disable-line react-hooks/exhaustive-deps

  // evento do servidor: aplica na lista sem chamar o Balcão
  useRealtimeEvents(realtime, (e) => {
    if (e.type === "resync") return void reload();
    if (e.type !== "balcao") return;
    const ev = e as unknown as { offers: Offer[]; proposals: Proposal[]; moved: number };
    setOffers((prev) => (prev ? mergeOffers(prev, ev.offers, ev.proposals, programRef.current) : prev));
    if (ev.proposals.length && tabRef.current === "propostas") void loadMine();
    if (ev.moved) toast(`${ev.moved} negociação(ões) do CRM Milhas atualizada(s) pelo Balcão`);
  });

  async function unlink() {
    if (!(await confirmDialog({ title: "Desvincular o Balcão?", body: "As negociações do CRM Milhas continuam, mas deixam de andar sozinhas. Para vincular de novo, gere outro código no bot.", confirmLabel: "Desvincular", danger: true }))) return;
    const r = await api<{ item: Status }>("/api/balcao", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    setStatus(r.data.item);
    router.refresh();
  }

  async function propose(o: Offer, cents: number) {
    const r = await api<{ item: { changed: boolean; deal: Deal } }>(`/api/balcao/offers/${o.id}/proposal`, "PUT", { cpmCents: cents });
    if (!r.ok) { if (!lost(r)) toast(r.erro, "error"); return false; }
    toast(r.data.item.changed ? `Proposta de ${fmtBRL(cents)} enviada ao comprador` : "Essa proposta já estava enviada");
    await loadOffers(1);
    return true;
  }

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
        <span className="flex items-center gap-2"><Handshake className="h-4 w-4 text-muted" />Vinculado como <b>{m.name ?? "membro"}</b>{m.username && <span className="text-muted">@{m.username}</span>}{m.role && <span className="rounded-full bg-panel2 px-2 py-0.5 text-xs">{ROLE[m.role] ?? m.role}</span>}</span>
        {live ? <span className="flex items-center gap-1.5 text-xs text-green-300"><span className="h-2 w-2 rounded-full bg-green-400" />Ao vivo</span>
          : status.syncedAt && <span className="text-xs text-muted">Atualizado {fmtDateTime(status.syncedAt)}</span>}
        <span className="ml-auto flex gap-2">
          <button type="button" className="btn-ghost" onClick={() => void refresh(true)} disabled={syncing}><RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Atualizar</button>
          {canEdit && <button type="button" className="btn-ghost text-red-300" onClick={unlink}><Unlink className="h-4 w-4" />Desvincular</button>}
        </span>
      </div>
      {!m.canView && <Alert kind="error">Seu plano no Balcão não está ativo: renove no bot para ver as ofertas.</Alert>}
      {m.canView && !m.canSell && <Alert kind="info">Você pode ver as ofertas. Para mandar propostas, é preciso o Módulo Milheiro no Balcão.</Alert>}
      {error && <Alert>{error}</Alert>}

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedButtons items={[{ key: "ofertas", label: "Ofertas abertas" }, { key: "propostas", label: "Minhas propostas" }, { key: "comprar", label: "Minhas compras" }, { key: "negociacoes", label: "Negociações" }]} value={tab} onChange={setTab} />
        {tab === "ofertas" && (
          <select className="input w-auto" value={program} onChange={(e) => setProgram(e.target.value)} aria-label="Programa">
            {PROGRAMS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        )}
      </div>

      {tab === "ofertas" ? (
        offers === null ? <p className="text-sm text-muted">Carregando ofertas…</p>
        : offers.length === 0 ? <Empty title="Nenhuma oferta aberta agora" icon={<Handshake className="h-5 w-5" />}><p className="text-sm text-muted">{live ? "Novas ofertas aparecem aqui na hora." : "Novas ofertas aparecem aqui sozinhas (a página confere a cada minuto)."}</p></Empty>
        : (
          <>
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {offers.map((o) => <OfferCard key={o.id} o={o} canPropose={canEdit && m.canSell && !o.sua_oferta} onPropose={propose} />)}
            </div>
            {more && <button type="button" className="btn-ghost" onClick={() => void loadOffers(page + 1)}>Carregar mais</button>}
          </>
        )
      ) : tab === "comprar" ? <BuyPanel canEdit={canEdit} realtime={realtime} canBuy={m.canView} />
        : tab === "negociacoes" ? <DealsPanel canEdit={canEdit} realtime={realtime} />
        : mine === null ? <p className="text-sm text-muted">Carregando propostas…</p>
        : mine.length === 0 ? <Empty title="Nenhuma proposta ainda" icon={<Handshake className="h-5 w-5" />} />
        : <ProposalList items={mine} canEdit={canEdit} realtime={realtime} />}
    </div>
  );
}

/** Aplica o que mudou no Balcão: oferta aberta entra no topo (ou é atualizada); a que fechou sai da lista. A minha
 *  proposta só muda se veio no evento (o evento traz só o que mudou). */
function mergeOffers(prev: Offer[], changed: Offer[], proposals: Proposal[], program: string): Offer[] {
  let list = [...prev];
  for (const o of changed) {
    const i = list.findIndex((x) => x.id === o.id);
    if (o.status !== "open") { if (i >= 0) list.splice(i, 1); continue; }
    if (i >= 0) list[i] = { ...o, myProposal: o.myProposal ?? list[i]!.myProposal, deal: o.deal ?? list[i]!.deal };
    else if (!program || o.programa === program) list = [o, ...list];
  }
  for (const p of proposals) {
    const i = list.findIndex((x) => x.id === p.oferta_id);
    if (i >= 0) list[i] = { ...list[i]!, myProposal: p };
  }
  return list;
}

function OfferCard({ o, canPropose, onPropose }: { o: Offer; canPropose: boolean; onPropose: (o: Offer, cents: number) => Promise<boolean> }) {
  const [counter, setCounter] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const a = o.analysis;
  // lucro a um milheiro qualquer: (milheiro − custo da conta que emitiria) × milhas
  const profitAt = (cents: number) => (a ? Math.round((o.milhas * (cents - a.costCpmCents)) / 1000) : null);
  const counterCents = counter != null ? parseBRLToCents(counter) : null;
  const Profit = ({ cents }: { cents: number }) => {
    const p = profitAt(cents);
    return p == null ? null : <b className={p >= 0 ? "text-green-300" : "text-red-300"}>{fmtBRL(p)}</b>;
  };
  async function send(cents: number) {
    setBusy(true);
    const ok = await onPropose(o, cents);
    setBusy(false);
    if (ok) setCounter(null);
  }
  async function sendCounter(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseBRLToCents(counter ?? "");
    if (cents == null || cents < 100 || cents > 50_000) return toast("Valor por milheiro entre R$ 1,00 e R$ 500,00", "error");
    await send(cents);
  }
  return (
    <article className="card flex flex-col gap-3 p-4">
      <header className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Oferta #{o.id} · {o.programa_nome}</p>
          <p className="text-lg font-semibold">{fmtPts(o.milhas)} milhas · {o.cpfs} CPF{o.cpfs > 1 ? "s" : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{fmtBRL(o.milheiro_centavos)}</p>
          <p className="text-xs text-muted">o milheiro · total {fmtBRL(o.total_centavos)}</p>
        </div>
      </header>
      <div className="flex flex-wrap gap-1.5 text-xs">
        {o.urgente && <span className="flex items-center gap-1 rounded-full bg-red-400/15 px-2 py-0.5 text-red-300"><Zap className="h-3 w-3" />Voo em menos de 7 dias</span>}
        {o.intermediada && <span className="flex items-center gap-1 rounded-full bg-blue-400/15 px-2 py-0.5 text-blue-300"><ShieldCheck className="h-3 w-3" />Intermediação do balcão</span>}
        <span className="rounded-full bg-panel2 px-2 py-0.5 text-muted">Válida até {fmtDateTime(o.valida_ate)}</span>
      </div>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>Comprador: {ROLE[o.comprador.perfil ?? ""] ?? "membro"}</span>
        {o.comprador.verificado && <span className="flex items-center gap-1 text-green-300"><BadgeCheck className="h-3 w-3" />verificado</span>}
        <span>{o.comprador.negociacoes} negociação(ões)</span>
        {o.comprador.nota != null && <span className="flex items-center gap-1"><Star className="h-3 w-3" />{o.comprador.nota.toFixed(1)} ({o.comprador.avaliacoes})</span>}
      </p>
      {o.observacao && <p className="rounded-lg bg-panel2 px-3 py-2 text-sm">{o.observacao}</p>}
      <p className="text-sm">
        {!a ? <span className="text-muted">Você não tem conta neste programa.</span>
          : a.covers ? <>Emite com <b>{a.account}</b> · lucro a {fmtBRL(o.milheiro_centavos)}: <Profit cents={o.milheiro_centavos} /></>
          : <><span className="text-amber-300">Nenhuma conta cobre sozinha{a.missingMiles > 0 ? ` (faltam ${fmtPts(a.missingMiles)} milhas em ${a.account})` : a.cpfShort ? ` (faltam CPFs em ${a.account})` : ""}.</span>
            {" "}<span className="text-muted">Lucro estimado pelo custo de {a.account} a {fmtBRL(o.milheiro_centavos)}:</span> <Profit cents={o.milheiro_centavos} /></>}
      </p>
      {o.myProposal && (
        <p className="text-sm">Sua proposta: <b>{fmtBRL(o.myProposal.valor_centavos)}</b>{a && o.myProposal.valor_centavos !== o.milheiro_centavos && <> (lucro <Profit cents={o.myProposal.valor_centavos} />)</>} <span className={PROPOSAL[o.myProposal.status][1]}>· {PROPOSAL[o.myProposal.status][0]}</span>
          {o.deal && <> · <Link className="underline" href={`/app/crm-milhas?deal=${o.deal.id}`}>CRM Milhas #{o.deal.number}</Link></>}</p>
      )}
      <footer className="mt-auto flex flex-wrap items-center gap-2">
        {canPropose && counter === null && (
          <>
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void send(o.milheiro_centavos)}>Aceitar {fmtBRL(o.milheiro_centavos)}</button>
            <button type="button" className="btn-ghost" disabled={busy} onClick={() => setCounter(o.myProposal ? (o.myProposal.valor_centavos / 100).toFixed(2).replace(".", ",") : "")}>Contrapropor</button>
          </>
        )}
        {canPropose && counter !== null && (
          <form onSubmit={sendCounter} className="flex w-full gap-2">
            <input className="input" inputMode="decimal" value={counter} onChange={(e) => setCounter(e.target.value)} placeholder="R$ por milheiro (ex.: 21,50)" aria-label="Valor por milheiro" autoFocus />
            <button className="btn-primary" disabled={busy}>{busy ? "Enviando…" : "Enviar"}</button>
            <button type="button" className="btn-ghost" onClick={() => setCounter(null)}>Cancelar</button>
          </form>
        )}
        {canPropose && counter !== null && a && counterCents != null && counterCents >= 100 && (
          <p className="w-full text-sm">Lucro a {fmtBRL(counterCents)}: <Profit cents={counterCents} />
            <span className="text-muted"> ({fmtBRL(counterCents - o.milheiro_centavos)} {counterCents >= o.milheiro_centavos ? "acima" : "abaixo"} do que o comprador oferece{a.covers ? "" : `; estimado pelo custo de ${a.account}`})</span></p>
        )}
        {o.sua_oferta && <span className="text-xs text-muted">Esta oferta é sua.</span>}
        {o.link_bot && <a className="btn-ghost ml-auto" href={o.link_bot} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir no bot</a>}
      </footer>
    </article>
  );
}

// Em andamento: aguardando o comprador numa oferta ainda aberta, ou escolhida com a negociação correndo. O resto
// (recusada, oferta cancelada/expirada/fechada com outro, negociação concluída) vai para as encerradas.
const proposalActive = (p: MyProposal) =>
  (p.status === "pending" && p.oferta.status === "open") || (p.status === "chosen" && ["awaiting_payment", "matched"].includes(p.oferta.status));
const proposalKey = (p: MyProposal) => p.id;
const proposalNumber = (p: MyProposal) => p.oferta.id;
const proposalDone = (p: MyProposal) => p.status === "chosen" && p.oferta.status === "completed";

function ProposalList({ items, canEdit, realtime }: { items: MyProposal[]; canEdit: boolean; realtime: boolean }) {
  const { hidden, setHidden } = useHidden("propostas");
  const active = items.filter(proposalActive);
  const closed = items.filter((p) => !proposalActive(p));
  return (
    <div className="space-y-3">
      {active.length ? (
        <div className="card divide-y divide-line">
          {active.map((p) => <ProposalRow key={p.id} p={p} canEdit={canEdit} realtime={realtime} />)}
        </div>
      ) : <p className="text-sm text-muted">Nenhuma proposta em andamento.</p>}
      <ClosedSection kind="propostas" items={closed} idOf={proposalKey} numberOf={proposalNumber} done={proposalDone} labels={{ ok: "Concluídas", nao: "Não fechadas" }}
        hidden={hidden} setHidden={setHidden} canEdit={canEdit}
        render={(list, action) => <div className="card divide-y divide-line">{list.map((p) => <ProposalRow key={p.id} p={p} canEdit={canEdit} realtime={realtime} action={action(p)} />)}</div>} />
    </div>
  );
}

// etapas em que a proposta escolhida virou negociação (com conversa)
const DEAL_STATES = ["awaiting_payment", "matched", "completed"];

function ProposalRow({ p, canEdit, realtime, action }: { p: MyProposal; canEdit: boolean; realtime: boolean; action?: React.ReactNode }) {
  const hasDeal = p.status === "chosen" && DEAL_STATES.includes(p.oferta.status);
  const [chat, setChat] = useState(hasDeal && p.oferta.status !== "completed");
  return (
    <div className="px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-medium">#{p.oferta.id} · {p.oferta.programa_nome} · {fmtPts(p.oferta.milhas)} milhas</span>
        <span>Minha proposta {fmtBRL(p.valor_centavos)}{p.contraproposta ? " (contraproposta)" : ""}</span>
        <span className={PROPOSAL[p.status][1]}>{PROPOSAL[p.status][0]}</span>
        <span className="text-muted">Oferta: {OFFER_STATUS[p.oferta.status] ?? p.oferta.status}</span>
        <span className="ml-auto flex flex-wrap items-center gap-3">
          {hasDeal && (
            <button type="button" className={chat ? "btn-ghost" : "btn-primary"} onClick={() => setChat((v) => !v)}>
              <MessageCircle className="h-4 w-4" />{chat ? "Fechar a negociação" : "Abrir a conversa"}
            </button>
          )}
          {p.deal && <Link className="underline" href={`/app/crm-milhas?deal=${p.deal.id}`}>CRM Milhas #{p.deal.number} · {p.deal.archived ? "arquivada" : DEAL_STAGE_LABELS[p.deal.stage]}</Link>}
          {p.oferta.link_bot && <a className="underline" href={p.oferta.link_bot} target="_blank" rel="noreferrer">Abrir no bot</a>}
          {action}
        </span>
      </div>
      {hasDeal && chat && <div className="mt-3"><DealInline id={p.oferta.id} canEdit={canEdit} realtime={realtime} /></div>}
    </div>
  );
}
