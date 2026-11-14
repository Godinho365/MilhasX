"use client";
// Balcão MilhasX, a negociação (para quem compra e para quem vende): etapas, a outra parte, as ações do bot (emitida,
// recebi, desistir, reclamar, avaliar) e a conversa. A conversa é a mesma do bot do Balcão: o que vai daqui chega no
// Telegram da outra parte e o que ela responde por lá aparece aqui na hora (WebSocket). As regras são as do bot.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, Check, CheckCheck, Copy, ExternalLink, MessageCircle, ShieldCheck, QrCode, RefreshCw, Undo2, FileText, Handshake, Paperclip, Plane, Send, Star, X } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtPts, fmtDateTime } from "@/lib/format";
import { Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { useRealtimeEvents } from "@/lib/realtime";
import QRCode from "qrcode";

type Person = { perfil: string | null; verificado: boolean; negociacoes: number; nota: number | null; avaliacoes: number; nome: string | null; usuario: string | null; telegram_id?: number | null; reputacao_url?: string | null };
export type Deal = {
  id: number; papel: "comprador" | "vendedor"; status: string; programa: string; programa_nome: string; milhas: number; cpfs: number;
  intermediada: boolean; observacao: string | null; milheiro_centavos: number; total_centavos: number; taxa_centavos: number;
  comprador_paga_centavos: number; escolhida_em: string | null; paga_em: string | null; emitida_em: string | null;
  concluida_em: string | null; cancelada_por: "voce" | "outra_parte" | null; outra_parte: Person;
  acoes: { conversar: boolean; emitida: boolean; concluida: boolean; cancelar: boolean; reclamar: boolean; avaliar: boolean; cancelar_emissao?: boolean; pagar?: boolean };
  minha_avaliacao: { estrelas: number; comentario: string | null } | null; link_bot: string | null;
  pix?: Pix | null;
  cancelamento_emissao?: { pago_centavos: number; taxa_servico_centavos: number; taxa_intermediacao_centavos: number; estorno_centavos: number; prazo_ate: string | null } | null;
};
type Pix = {
  id: number; valor_centavos: number; automatico: boolean; copia_e_cola: string | null; expira_em: string | null;
  vencido: boolean; chave_pix: string | null; favorecido: string | null;
};
type Msg = {
  id: number; negociacao_id: number; minha: boolean; via: string; texto: string | null; entregue: boolean; criada_em: string;
  arquivo: { tipo: "photo" | "document"; nome: string | null; mime: string | null; tamanho: number | null } | null;
};

const STATUS: Record<string, [string, string]> = {
  awaiting_payment: ["Aguardando o PIX", "bg-amber-400/15 text-amber-300"],
  matched: ["Em andamento", "bg-blue-400/15 text-blue-300"],
  completed: ["Concluída", "bg-green-400/15 text-green-300"],
  cancelled: ["Cancelada", "bg-panel2 text-muted"],
  expired: ["Expirada", "bg-panel2 text-muted"],
};
const ROLE: Record<string, string> = { viajante: "Viajante", agente: "Agência", milheiro: "Milheiro" };
const ACTIVE = ["awaiting_payment", "matched"];
const FILE_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

export function DealsPanel({ canEdit, realtime, focus }: { canEdit: boolean; realtime: boolean; focus?: number | null }) {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [openId, setOpenId] = useState<number | null>(focus ?? null);
  const [unread, setUnread] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(openId);
  openRef.current = openId;
  const [incoming, setIncoming] = useState<{ deal?: Deal; messages: Msg[]; n: number }>({ messages: [], n: 0 });

  const load = useCallback(async () => {
    const r = await api<{ items: Deal[] }>("/api/balcao/deals?todas=1");
    if (!r.ok) return setError(r.erro);
    setError(null);
    setDeals(r.data.items);
    setOpenId((cur) => cur ?? r.data.items.find((d) => ACTIVE.includes(d.status))?.id ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (focus) setOpenId(focus); }, [focus]);

  useRealtimeEvents(realtime, (e) => {
    if (e.type === "resync") return void load();
    if (e.type !== "balcao") return;
    const ev = e as unknown as { deals?: Deal[]; messages?: Msg[] };
    const changed = ev.deals ?? [];
    const msgs = ev.messages ?? [];
    if (changed.length) {
      setDeals((list) => {
        if (!list) return list;
        const next = [...list];
        for (const d of changed) {
          const i = next.findIndex((x) => x.id === d.id);
          if (i >= 0) next[i] = d; else next.unshift(d);
        }
        return next;
      });
    }
    const theirs = msgs.filter((m) => !m.minha);
    const elsewhere = theirs.filter((m) => m.negociacao_id !== openRef.current);
    if (elsewhere.length) {
      setUnread((u) => { const n = { ...u }; for (const m of elsewhere) n[m.negociacao_id] = (n[m.negociacao_id] ?? 0) + 1; return n; });
      toast(`Nova mensagem na negociação #${elsewhere[0]!.negociacao_id}`);
    }
    const here = msgs.filter((m) => m.negociacao_id === openRef.current);
    const deal = changed.find((d) => d.id === openRef.current);
    if (here.length || deal) setIncoming((p) => ({ deal, messages: here, n: p.n + 1 }));
  });

  const active = useMemo(() => deals?.filter((d) => ACTIVE.includes(d.status)) ?? [], [deals]);
  const closed = useMemo(() => deals?.filter((d) => !ACTIVE.includes(d.status)) ?? [], [deals]);
  const open = deals?.find((d) => d.id === openId) ?? null;

  if (error) return <Alert>{error}</Alert>;
  if (deals === null) return <p className="text-sm text-muted">Carregando negociações…</p>;
  if (!deals.length) {
    return <Empty title="Nenhuma negociação ainda" icon={<Handshake className="h-5 w-5" />}><p className="text-sm text-muted">Quando um comprador escolher a sua proposta, ou você escolher um vendedor, a negociação aparece aqui com a conversa.</p></Empty>;
  }
  return (
    <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
      <nav className="space-y-2" aria-label="Negociações">
        {active.map((d) => <DealRow key={d.id} d={d} active={d.id === openId} unread={unread[d.id] ?? 0} onClick={() => { setOpenId(d.id); setUnread((u) => ({ ...u, [d.id]: 0 })); }} />)}
        {closed.length > 0 && (
          <details className="pt-1" open={!active.length}>
            <summary className="cursor-pointer text-xs text-muted">Encerradas ({closed.length})</summary>
            <div className="mt-2 space-y-2">{closed.map((d) => <DealRow key={d.id} d={d} active={d.id === openId} unread={0} onClick={() => setOpenId(d.id)} />)}</div>
          </details>
        )}
      </nav>
      {open ? <DealDetail key={open.id} id={open.id} summary={open} canEdit={canEdit} incoming={incoming} onChanged={(d) => setDeals((l) => l?.map((x) => (x.id === d.id ? d : x)) ?? l)} />
        : <p className="text-sm text-muted">Escolha uma negociação.</p>}
    </div>
  );
}

function DealRow({ d, active, unread, onClick }: { d: Deal; active: boolean; unread: number; onClick: () => void }) {
  const [label, tone] = STATUS[d.status] ?? [d.status, ""];
  return (
    <button type="button" onClick={onClick} className={`card w-full px-3 py-2 text-left text-sm ${active ? "ring-1 ring-accent" : ""}`}>
      <span className="flex items-center justify-between gap-2">
        <b>#{d.id} · {d.programa_nome}</b>
        {unread > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-black">{unread}</span>}
      </span>
      <span className="block text-xs text-muted">{fmtPts(d.milhas)} milhas · {fmtBRL(d.milheiro_centavos)} · você {d.papel === "comprador" ? "compra" : "vende"}</span>
      <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs ${tone}`}>{d.status === "matched" && d.emitida_em ? "Emitida" : label}</span>
    </button>
  );
}

type Incoming = { deal?: Deal; messages: Msg[]; n: number };

// A negociação dentro de outro lugar da página (o cartão da compra ou da proposta), com a mesma conversa ao vivo
export function DealInline({ id, canEdit, realtime }: { id: number; canEdit: boolean; realtime: boolean }) {
  const [incoming, setIncoming] = useState<Incoming>({ messages: [], n: 0 });
  useRealtimeEvents(realtime, (e) => {
    if (e.type !== "balcao") return;
    const ev = e as unknown as { deals?: Deal[]; messages?: Msg[] };
    const here = (ev.messages ?? []).filter((m) => m.negociacao_id === id);
    const deal = (ev.deals ?? []).find((d) => d.id === id);
    if (here.length || deal) setIncoming((p) => ({ deal, messages: here, n: p.n + 1 }));
  });
  return <DealDetail id={id} canEdit={canEdit} incoming={incoming} onChanged={noop} />;
}
function noop() {}

function DealDetail({ id, summary, canEdit, incoming, onChanged }: {
  id: number; summary?: Deal; canEdit: boolean; incoming: Incoming; onChanged: (d: Deal) => void;
}) {
  const [deal, setDeal] = useState<Deal | null>(summary ?? null);
  const [messages, setMessages] = useState<Msg[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const apply = useCallback((d: Deal) => { setDeal(d); onChanged(d); }, [onChanged]);
  const load = useCallback(async () => {
    const r = await api<{ item: { deal: Deal; messages: Msg[] } }>(`/api/balcao/deals/${id}`);
    if (!r.ok) return toast(r.erro, "error");
    apply(r.data.item.deal);
    setMessages(r.data.item.messages);
  }, [id, apply]);
  useEffect(() => { void load(); }, [load]);

  // ao vivo: mensagem nova ou etapa mudou nesta negociação
  useEffect(() => {
    if (!incoming.n) return;
    if (incoming.deal) setDeal(incoming.deal);
    if (incoming.messages.length) setMessages((list) => {
      const have = new Set((list ?? []).map((m) => m.id));
      return [...(list ?? []), ...incoming.messages.filter((m) => !have.has(m.id))];
    });
  }, [incoming]);
  useEffect(() => { endRef.current?.scrollIntoView({ block: "nearest" }); }, [messages?.length]);

  async function act(action: "emitida" | "concluida" | "cancelar" | "cancelar-emissao") {
    if (!deal) return;
    const confirm = {
      emitida: { title: "Informar que a passagem foi emitida?", body: "O comprador é avisado para conferir a reserva na companhia.", confirmLabel: "Passagem emitida" },
      concluida: { title: "Confirmar que recebeu a passagem?", body: deal.intermediada ? "A negociação é concluída e o Balcão repassa o pagamento ao vendedor." : "Confirme só depois de conferir a reserva e pagar o vendedor.", confirmLabel: "Confirmar" },
      "cancelar-emissao": {
        title: "Cancelar a emissão?",
        body: deal.cancelamento_emissao
          ? `Valor pago: ${fmtBRL(deal.cancelamento_emissao.pago_centavos)}. Taxa de serviço (fica com o vendedor): ${fmtBRL(deal.cancelamento_emissao.taxa_servico_centavos)}. Taxa de intermediação: ${fmtBRL(deal.cancelamento_emissao.taxa_intermediacao_centavos)}. Você recebe de volta ${fmtBRL(deal.cancelamento_emissao.estorno_centavos)}, na conta que pagou. O vendedor cancela a reserva na companhia.`
          : "O vendedor é avisado e cancela a reserva na companhia.",
        confirmLabel: "Cancelar a emissão", danger: true,
      },
      cancelar: { title: "Desistir da negociação?", body: deal.paga_em ? "O valor pago à intermediação é estornado ao comprador. A outra parte é avisada." : "A outra parte é avisada no bot.", confirmLabel: "Desistir", danger: true },
    }[action];
    if (!(await confirmDialog(confirm))) return;
    setBusy(true);
    const r = await api<{ item: Deal }>(`/api/balcao/deals/${deal.id}/actions/${action}`, "POST");
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    apply(r.data.item);
    toast({ emitida: "Comprador avisado", concluida: "Negociação concluída", cancelar: "Negociação cancelada", "cancelar-emissao": "Emissão cancelada: o estorno foi pedido" }[action]);
  }

  if (!deal) return <p className="text-sm text-muted">Carregando a conversa…</p>;
  const o = deal.outra_parte;
  const [label, tone] = STATUS[deal.status] ?? [deal.status, ""];
  const isBuyer = deal.papel === "comprador";
  return (
    <section className="card flex min-h-[520px] flex-col p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Negociação #{deal.id} · {deal.programa_nome} · você {isBuyer ? "compra" : "vende"}</p>
          <p className="text-lg font-semibold">{fmtPts(deal.milhas)} milhas · {deal.cpfs} CPF{deal.cpfs > 1 ? "s" : ""}</p>
          <p className="text-sm text-muted">{fmtBRL(deal.milheiro_centavos)} o milheiro · total {fmtBRL(deal.total_centavos)}{deal.intermediada && isBuyer ? ` + taxa ${fmtBRL(deal.taxa_centavos)}` : ""}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${tone}`}>{label}</span>
      </header>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span>{isBuyer ? "Vendedor" : "Comprador"}: <b>{o.nome ?? ROLE[o.perfil ?? ""] ?? "membro"}</b>{o.usuario && <a className="ml-1 text-muted underline" href={`https://t.me/${o.usuario}`} target="_blank" rel="noreferrer">@{o.usuario}</a>}</span>
        {o.verificado && <span className="flex items-center gap-1 text-xs text-green-300"><BadgeCheck className="h-3 w-3" />verificado</span>}
        {o.nota != null ? <span className="flex items-center gap-1 text-xs text-muted"><Star className="h-3 w-3" />{o.nota.toFixed(1)} ({o.avaliacoes})</span> : <span className="text-xs text-muted">sem avaliações</span>}
        <span className="text-xs text-muted">{o.negociacoes} negociação(ões)</span>
      </p>
      {(o.reputacao_url || o.usuario || o.telegram_id) && (
        <p className="mt-1 flex flex-wrap gap-2">
          {o.reputacao_url && <a className="btn-ghost" href={o.reputacao_url} target="_blank" rel="noreferrer"><ShieldCheck className="h-4 w-4" />Ver reputação</a>}
          {(o.usuario || o.telegram_id) && (
            <a className="btn-ghost" href={o.usuario ? `https://t.me/${o.usuario}` : `tg://user?id=${o.telegram_id}`} target="_blank" rel="noreferrer"
              title="Conversa direta no Telegram (fica só lá, não aparece aqui nem no Balcão)">
              <MessageCircle className="h-4 w-4" />Mensagem privada no Telegram
            </a>
          )}
        </p>
      )}

      <Steps d={deal} />
      <Guidance d={deal} />
      {isBuyer && deal.pix && <PixBox dealId={deal.id} pix={deal.pix} canEdit={canEdit} onChanged={apply} />}

      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {deal.acoes.emitida && <button type="button" className="btn-primary" disabled={busy} onClick={() => void act("emitida")}><Plane className="h-4 w-4" />Passagem emitida</button>}
          {deal.acoes.concluida && <button type="button" className="btn-primary" disabled={busy} onClick={() => void act("concluida")}><CheckCheck className="h-4 w-4" />{deal.intermediada ? "Recebi a passagem" : "Recebi a passagem e paguei"}</button>}
          {deal.acoes.reclamar && <button type="button" className="btn-ghost" onClick={() => setReporting((v) => !v)}><AlertTriangle className="h-4 w-4" />Reportar problema</button>}
          {deal.acoes.cancelar && <button type="button" className="btn-ghost text-red-300" disabled={busy} onClick={() => void act("cancelar")}><X className="h-4 w-4" />Desistir</button>}
          {deal.acoes.cancelar_emissao && deal.cancelamento_emissao && (
            <button type="button" className="btn-ghost text-red-300" disabled={busy} onClick={() => void act("cancelar-emissao")}
              title={deal.cancelamento_emissao.prazo_ate ? `Até ${fmtDateTime(deal.cancelamento_emissao.prazo_ate)}` : undefined}>
              <Undo2 className="h-4 w-4" />Cancelar a emissão
            </button>
          )}
          {deal.link_bot && <a className="btn-ghost ml-auto" href={deal.link_bot} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir o bot</a>}
        </div>
      )}
      {reporting && <ReportForm dealId={deal.id} onDone={() => setReporting(false)} />}
      {canEdit && deal.acoes.avaliar && <RateForm dealId={deal.id} other={isBuyer ? "o vendedor" : "o comprador"} onDone={apply} />}
      {deal.minha_avaliacao && <p className="mt-2 text-sm text-muted">Sua avaliação: {"⭐".repeat(deal.minha_avaliacao.estrelas)}{deal.minha_avaliacao.comentario && ` · “${deal.minha_avaliacao.comentario}”`}</p>}

      <Chat deal={deal} messages={messages} canEdit={canEdit} endRef={endRef}
        onSent={(m) => setMessages((l) => (l?.some((x) => x.id === m.id) ? l : [...(l ?? []), m]))} />
    </section>
  );
}

function PixBox({ dealId, pix, canEdit, onChanged }: { dealId: number; pix: Pix; canEdit: boolean; onChanged: (d: Deal) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!pix.copia_e_cola) return setQr(null);
    let on = true;
    QRCode.toDataURL(pix.copia_e_cola, { margin: 1, width: 220 }).then((u) => on && setQr(u)).catch(() => on && setQr(null));
    return () => { on = false; };
  }, [pix.copia_e_cola]);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); toast("Copiado"); } catch { toast("Não deu para copiar: selecione o código", "error"); }
  }
  async function check() {
    setBusy(true);
    const r = await api<{ item: { result: "pago" | "pendente" | "novo" | "manual"; deal: Deal } }>(`/api/balcao/deals/${dealId}/pix`, "POST");
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    onChanged(r.data.item.deal);
    toast({ pago: "Pagamento confirmado: negociação liberada", pendente: "Ainda não identificamos o pagamento. Assim que cair, a negociação libera sozinha.", novo: "O código tinha vencido: geramos um PIX novo", manual: "Envie o comprovante para a equipe conferir" }[r.data.item.result], r.data.item.result === "pendente" ? "error" : "ok");
  }
  async function proof(file: File) {
    if (!FILE_TYPES.includes(file.type)) return toast("Envie o comprovante em PDF ou imagem (JPG, PNG ou WEBP)", "error");
    if (file.size > 10 * 1024 * 1024) return toast("Arquivo grande demais: até 10 MB", "error");
    setBusy(true);
    const res = await fetch(`/api/balcao/deals/${dealId}/pix/proof?nome=${encodeURIComponent(file.name)}`, { method: "POST", headers: { "content-type": file.type }, body: file });
    setBusy(false);
    const body = await res.json().catch(() => null) as { ok?: boolean; item?: Deal; erro?: string } | null;
    if (!res.ok || !body?.ok || !body.item) return toast(body?.erro ?? "Não foi possível enviar o comprovante", "error");
    onChanged(body.item);
    toast("Comprovante enviado: avisamos quando a equipe confirmar");
  }

  return (
    <div className="mt-3 rounded-lg border border-line p-3">
      <p className="flex items-center gap-2 font-medium"><QrCode className="h-4 w-4" />PIX da intermediação · {fmtBRL(pix.valor_centavos)}</p>
      {pix.automatico ? (
        pix.vencido ? (
          <p className="mt-2 text-sm text-amber-300">Este código venceu. Toque em Gerar PIX novo.</p>
        ) : (
          <div className="mt-2 flex flex-wrap items-start gap-4">
            {qr && <img src={qr} alt="QR Code do PIX" className="h-40 w-40 rounded bg-white p-1" />}
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              <p className="text-muted">Pague pelo QR Code ou pelo PIX copia e cola. A confirmação é automática em instantes{pix.expira_em ? `; o código vale até ${fmtDateTime(pix.expira_em)}` : ""}.</p>
              {pix.copia_e_cola && (
                <div className="flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-panel2 px-2 py-1 text-xs">{pix.copia_e_cola}</code>
                  <button type="button" className="btn-ghost" onClick={() => void copy(pix.copia_e_cola!)}><Copy className="h-4 w-4" />Copiar</button>
                </div>
              )}
            </div>
          </div>
        )
      ) : (
        <div className="mt-2 space-y-1 text-sm">
          <p>Chave PIX do balcão: {pix.chave_pix ? <><code className="rounded bg-panel2 px-1">{pix.chave_pix}</code> <button type="button" className="underline" onClick={() => void copy(pix.chave_pix!)}>copiar</button></> : <i>fale com o suporte</i>}</p>
          {pix.favorecido && <p className="text-muted">Favorecido: {pix.favorecido}</p>}
          <p className="text-muted">Depois de pagar, envie a foto ou o PDF do comprovante para a equipe conferir.</p>
        </div>
      )}
      {canEdit && (
        <div className="mt-3 flex flex-wrap gap-2">
          {pix.automatico ? (
            <button type="button" className="btn-primary" disabled={busy} onClick={() => void check()}>
              <RefreshCw className="h-4 w-4" />{pix.vencido ? "Gerar PIX novo" : "Já paguei"}
            </button>
          ) : (
            <>
              <input ref={fileRef} type="file" accept={FILE_TYPES.join(",")} className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void proof(f); }} />
              <button type="button" className="btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" />Enviar comprovante</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Steps({ d }: { d: Deal }) {
  const steps: [string, string | null][] = [["Escolhida", d.escolhida_em], ...(d.intermediada ? [["PIX pago", d.paga_em] as [string, string | null]] : []), ["Emitida", d.emitida_em], ["Concluída", d.concluida_em]];
  return (
    <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs">
      {steps.map(([name, at]) => (
        <li key={name} className={`flex items-center gap-1 ${at ? "text-green-300" : "text-muted"}`} title={at ? fmtDateTime(at) : undefined}>
          {at ? <Check className="h-3 w-3" /> : <span className="inline-block h-2 w-2 rounded-full border border-current" />}{name}
        </li>
      ))}
    </ol>
  );
}

function Guidance({ d }: { d: Deal }) {
  const buyer = d.papel === "comprador";
  let text: string | null = null;
  if (d.status === "awaiting_payment") {
    text = buyer
      ? `Pague o PIX de ${fmtBRL(d.comprador_paga_centavos)} aqui embaixo (é o mesmo que o bot te mandou no Telegram). A conversa e o contato do vendedor liberam quando o pagamento cair.`
      : "Aguardando o comprador pagar a intermediação. Não emita nada antes disso: a conversa e o contato liberam quando o pagamento cair.";
  } else if (d.status === "matched" && !d.emitida_em) {
    text = buyer ? "Mande ao vendedor o voo (trecho, data e horário) e os dados dos passageiros: nome completo, CPF e data de nascimento."
      : "Receba do comprador o voo e os dados dos passageiros, emita com as suas milhas e envie o localizador. Depois, toque em Passagem emitida.";
  } else if (d.status === "matched") {
    text = buyer
      ? d.intermediada ? "Confira a reserva no site ou app da companhia e toque em Recebi a passagem. Sem resposta nem reclamação, o pagamento é liberado ao vendedor automaticamente."
        : `Confira a reserva no site ou app da companhia. Estando tudo certo, pague ${fmtBRL(d.total_centavos)} por PIX direto ao vendedor e confirme.`
      : "Passagem informada como emitida. Aguardando o comprador confirmar.";
  } else if (d.status === "cancelled") {
    text = d.cancelada_por === "voce" ? "Você desistiu desta negociação." : "A outra parte desistiu desta negociação.";
    if (d.emitida_em) text = buyer && d.cancelada_por === "voce" ? "Você cancelou a emissão. O estorno vai para a conta que pagou o PIX." : "A emissão foi cancelada pelo comprador. Cancele a reserva na companhia aérea para recuperar as milhas.";
  }
  if (buyer && d.cancelamento_emissao && d.status !== "cancelled") {
    const q = d.cancelamento_emissao;
    const extra = `Se precisar cancelar a emissão${q.prazo_ate ? ` (até ${fmtDateTime(q.prazo_ate)})` : ""}, você recebe de volta ${fmtBRL(q.estorno_centavos)}.`;
    text = text ? `${text} ${extra}` : extra;
  }
  return text ? <Alert kind="info">{text}</Alert> : null;
}

function ReportForm({ dealId, onDone }: { dealId: number; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await api(`/api/balcao/deals/${dealId}/report`, "POST", { text });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast("Reclamação enviada à equipe do Balcão");
    onDone();
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border border-line p-3">
      <p className="text-sm">Conte o que aconteceu. A equipe do Balcão recebe e, na intermediação, o repasse ao vendedor fica segurado até resolver.</p>
      <textarea className="input min-h-[70px]" value={text} onChange={(e) => setText(e.target.value)} maxLength={1500} required minLength={10} />
      <div className="flex gap-2"><button className="btn-primary" disabled={busy}>Enviar reclamação</button><button type="button" className="btn-ghost" onClick={onDone}>Cancelar</button></div>
    </form>
  );
}

function RateForm({ dealId, other, onDone }: { dealId: number; other: string; onDone: (d: Deal) => void }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stars) return toast("Escolha de 1 a 5 estrelas", "error");
    setBusy(true);
    const r = await api<{ item: Deal }>(`/api/balcao/deals/${dealId}/rating`, "POST", { stars, comment: comment.trim() || null });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast("Obrigado pela avaliação!");
    onDone(r.data.item);
  }
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 rounded-lg border border-line p-3">
      <p className="text-sm">Como foi negociar com {other}?</p>
      <div className="flex gap-1" role="radiogroup" aria-label="Estrelas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} estrela${n > 1 ? "s" : ""}`} onClick={() => setStars(n)}>
            <Star className={`h-6 w-6 ${n <= stars ? "fill-amber-300 text-amber-300" : "text-muted"}`} />
          </button>
        ))}
      </div>
      <input className="input" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="Comentário (opcional): pode aparecer no site do Balcão como depoimento, depois de revisado" />
      <button className="btn-primary" disabled={busy}>Avaliar</button>
    </form>
  );
}

function Chat({ deal, messages, canEdit, endRef, onSent }: {
  deal: Deal; messages: Msg[] | null; canEdit: boolean; endRef: React.RefObject<HTMLDivElement | null>; onSent: (m: Msg) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const other = deal.papel === "comprador" ? "vendedor" : "comprador";

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true);
    let r: { ok: true; data: { item: Msg } } | { ok: false; erro: string };
    if (file) {
      const q = new URLSearchParams({ nome: file.name, ...(text.trim() ? { texto: text.trim() } : {}) });
      try {
        const res = await fetch(`/api/balcao/deals/${deal.id}/files?${q}`, { method: "POST", body: file, headers: { "content-type": file.type }, credentials: "same-origin" });
        const data = await res.json().catch(() => ({}));
        r = res.ok && data.ok !== false ? { ok: true, data } : { ok: false, erro: data.erro || `Erro ${res.status}` };
      } catch {
        r = { ok: false, erro: "Sem conexão com o servidor" };
      }
    } else {
      r = await api<{ item: Msg }>(`/api/balcao/deals/${deal.id}/messages`, "POST", { text: text.trim() });
    }
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    onSent(r.data.item);
    setText("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function pick(f: File | null) {
    if (!f) return setFile(null);
    if (!FILE_TYPES.includes(f.type)) return toast("Envie PDF ou imagem (JPG, PNG ou WEBP)", "error");
    if (f.size > 10 * 1024 * 1024) return toast("Arquivo grande demais: até 10 MB", "error");
    setFile(f);
  }

  return (
    <div className="mt-4 flex flex-1 flex-col border-t border-line pt-3">
      <p className="mb-2 text-xs text-muted">Conversa com o {other}. É a mesma do bot do Balcão: o que você escreve aqui chega no Telegram dele, e o que ele responde por lá aparece aqui.</p>
      <div className="flex max-h-[420px] min-h-[160px] flex-1 flex-col gap-2 overflow-y-auto pr-1">
        {messages === null ? <p className="text-sm text-muted">Carregando conversa…</p>
          : messages.length === 0 ? <p className="text-sm text-muted">{deal.acoes.conversar ? "Nenhuma mensagem ainda." : "A conversa abre quando a negociação é liberada."}</p>
          : messages.map((m) => <Bubble key={m.id} m={m} dealId={deal.id} />)}
        <div ref={endRef} />
      </div>
      {canEdit && deal.acoes.conversar ? (
        <form onSubmit={send} className="mt-3 space-y-2">
          {file && <p className="flex items-center gap-2 text-xs"><FileText className="h-3 w-3" />{file.name}<button type="button" className="text-muted underline" onClick={() => pick(null)}>tirar</button></p>}
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept={FILE_TYPES.join(",")} className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} />
            <button type="button" className="btn-ghost" onClick={() => fileRef.current?.click()} aria-label="Anexar PDF ou imagem"><Paperclip className="h-4 w-4" /></button>
            <textarea className="input min-h-[42px] flex-1" rows={1} value={text} maxLength={4000} placeholder={file ? "Legenda (opcional)" : `Mensagem para o ${other}`}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); (e.currentTarget.form as HTMLFormElement | null)?.requestSubmit(); } }} />
            <button className="btn-primary" disabled={busy || (!text.trim() && !file)} aria-label="Enviar"><Send className="h-4 w-4" /></button>
          </div>
        </form>
      ) : !deal.acoes.conversar && (messages?.length ?? 0) > 0 ? <p className="mt-2 text-xs text-muted">A conversa está fechada nesta etapa.</p> : null}
    </div>
  );
}

function Bubble({ m, dealId }: { m: Msg; dealId: number }) {
  const url = `/api/balcao/deals/${dealId}/messages/${m.id}/file`;
  return (
    <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.minha ? "self-end bg-accent/15" : "self-start bg-panel2"}`}>
      {m.arquivo && (m.arquivo.tipo === "photo"
        // eslint-disable-next-line @next/next/no-img-element
        ? <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={m.arquivo.nome ?? "imagem"} className="mb-1 max-h-60 rounded-lg" loading="lazy" /></a>
        : <a href={url} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-2 underline"><FileText className="h-4 w-4" />{m.arquivo.nome ?? "arquivo"}</a>)}
      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
      <p className="mt-1 text-[11px] text-muted">
        {fmtDateTime(m.criada_em)} · {m.via === "milhasx" ? "pelo MilhasX" : "pelo Telegram"}
        {m.minha && !m.entregue && " · não chegou no Telegram da outra parte (ela vê se abrir pelo MilhasX)"}
      </p>
    </div>
  );
}
