"use client";
// Balcão MilhasX, lado de quem compra: abrir oferta (sai no canal do Balcão e alerta os milheiros, como pelo bot),
// acompanhar as propostas recebidas ao vivo, escolher o vendedor e cancelar. As regras (limite de 5 abertas, faixas,
// Viajante sempre com intermediação) são as do bot: a tela só ajuda a preencher, e o Balcão confere de novo.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BadgeCheck, ChevronDown, ChevronUp, ExternalLink, Plus, ShieldCheck, ShoppingCart, Star, X, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { fmtBRL, fmtPts, fmtDateTime, parseBRLToCents } from "@/lib/format";
import { Alert, Empty } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { useRealtimeEvents } from "@/lib/realtime";

type Person = { perfil: string | null; verificado: boolean; negociacoes: number; intermediacoes: number; nota: number | null; avaliacoes: number };
type Deal = {
  milheiro_centavos: number; total_centavos: number; taxa_centavos: number; voce_paga_centavos: number;
  escolhida_em: string | null; pago_em: string | null; emitida_em: string | null; concluida_em: string | null;
};
export type MyOffer = {
  id: number; status: string; programa: string; programa_nome: string; milhas: number; cpfs: number; milheiro_centavos: number;
  total_centavos: number; urgente: boolean; intermediada: boolean; observacao: string | null; criada_em: string; valida_ate: string;
  link_bot: string | null; propostas_pendentes: number; negociacao: Deal | null;
};
type Received = {
  id: number; oferta_id: number; valor_centavos: number; total_centavos: number | null; contraproposta: boolean;
  status: "pending" | "chosen" | "rejected"; vendedor: Person;
};
type Rules = {
  pode_comprar: boolean; ofertas_abertas: number; limite_ofertas: number; intermediacao_obrigatoria: boolean;
  taxa_milheiro_centavos: number; taxa_paga_por: "comprador" | "vendedor"; repasse_dias: number; validade_horas: number;
  programas: { chave: string; nome: string }[];
};

const STATUS: Record<string, [string, string]> = {
  open: ["Aberta", "bg-green-400/15 text-green-300"],
  awaiting_payment: ["Aguardando o seu PIX", "bg-amber-400/15 text-amber-300"],
  matched: ["Negociação liberada", "bg-blue-400/15 text-blue-300"],
  completed: ["Concluída", "bg-panel2 text-muted"],
  cancelled: ["Cancelada", "bg-panel2 text-muted"],
  expired: ["Expirada", "bg-panel2 text-muted"],
};
const ROLE: Record<string, string> = { viajante: "Viajante", agente: "Agência", milheiro: "Milheiro" };

/** "85k", "85.000" ou "85000" → 85000 */
function parseMiles(v: string): number | null {
  const s = v.trim().toLowerCase().replace(/\s/g, "");
  if (!s) return null;
  const k = s.endsWith("k");
  const n = Number((k ? s.slice(0, -1) : s).replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return Math.round(k ? n * 1000 : n);
}

export function BuyPanel({ canEdit, realtime, canBuy }: { canEdit: boolean; realtime: boolean; canBuy: boolean }) {
  const [rules, setRules] = useState<Rules | null>(null);
  const [offers, setOffers] = useState<MyOffer[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [proposals, setProposals] = useState<Record<number, Received[]>>({});
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const loadRules = useCallback(async () => {
    const r = await api<{ item: { regras: Rules } }>("/api/balcao/buy");
    if (r.ok) setRules(r.data.item.regras);
  }, []);
  const loadOffers = useCallback(async () => {
    const r = await api<{ items: MyOffer[] }>("/api/balcao/my-offers?todas=1");
    if (!r.ok) return setError(r.erro);
    setError(null);
    setOffers(r.data.items);
  }, []);
  const loadProposals = useCallback(async (id: number) => {
    const r = await api<{ item: { offer: MyOffer; proposals: Received[] } }>(`/api/balcao/my-offers/${id}`);
    if (!r.ok) return toast(r.erro, "error");
    setProposals((p) => ({ ...p, [id]: r.data.item.proposals }));
    setOffers((list) => list?.map((o) => (o.id === id ? r.data.item.offer : o)) ?? list);
  }, []);

  useEffect(() => { void loadRules(); void loadOffers(); }, [loadRules, loadOffers]);

  // ao vivo: proposta nova (ou retirada) numa oferta minha, ou a minha oferta mudou (paga, expirada…)
  useRealtimeEvents(realtime, (e) => {
    if (e.type === "resync") { void loadOffers(); if (openRef.current) void loadProposals(openRef.current); return; }
    if (e.type !== "balcao") return;
    const ev = e as unknown as { offers: { id: number; sua_oferta: boolean }[]; received?: Received[] };
    const received = ev.received ?? [];
    const mine = ev.offers.filter((o) => o.sua_oferta);
    if (!received.length && !mine.length) return;
    const fresh = received.filter((p) => p.status === "pending");
    if (fresh.length) toast(fresh.length === 1 ? `Nova proposta de ${fmtBRL(fresh[0]!.valor_centavos)} na oferta #${fresh[0]!.oferta_id}` : `${fresh.length} propostas novas nas suas ofertas`);
    const touched = new Set([...received.map((p) => p.oferta_id), ...mine.map((o) => o.id)]);
    if (openRef.current && touched.has(openRef.current)) void loadProposals(openRef.current);
    void loadOffers();
    if (mine.length) void loadRules();
  });

  async function cancel(o: MyOffer) {
    if (!(await confirmDialog({
      title: `Cancelar a oferta #${o.id}?`,
      body: o.propostas_pendentes ? `Quem mandou proposta (${o.propostas_pendentes}) é avisado no bot. O post do canal fica como cancelado.` : "O post do canal fica como cancelado.",
      confirmLabel: "Cancelar oferta", danger: true,
    }))) return;
    const r = await api<{ item: MyOffer }>(`/api/balcao/my-offers/${o.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast(`Oferta #${o.id} cancelada`);
    void loadOffers();
    void loadRules();
  }

  async function choose(o: MyOffer, p: Received) {
    const body = o.intermediada
      ? `O bot do Balcão te manda o PIX da intermediação no Telegram. O contato do vendedor é liberado quando o pagamento for confirmado. As outras propostas são recusadas.`
      : `O contato do vendedor é liberado agora, no seu Telegram (e o seu, para ele). As outras propostas são recusadas.`;
    if (!(await confirmDialog({ title: `Escolher a proposta de ${fmtBRL(p.valor_centavos)} o milheiro?`, body, confirmLabel: "Escolher" }))) return;
    const r = await api<{ item: MyOffer }>(`/api/balcao/my-offers/${o.id}/choose`, "POST", { proposalId: p.id });
    if (!r.ok) return toast(r.erro, "error");
    toast(r.data.item.status === "awaiting_payment" ? "Vendedor escolhido: pague o PIX que chegou no bot" : "Vendedor escolhido: o contato chegou no seu Telegram");
    setOpen(null);
    void loadOffers();
    void loadRules();
  }

  const active = useMemo(() => offers?.filter((o) => ["open", "awaiting_payment", "matched"].includes(o.status)) ?? null, [offers]);
  const past = useMemo(() => offers?.filter((o) => !["open", "awaiting_payment", "matched"].includes(o.status)).slice(0, 10) ?? [], [offers]);
  const full = !!rules && rules.ofertas_abertas >= rules.limite_ofertas;

  return (
    <div className="space-y-4">
      {error && <Alert>{error}</Alert>}
      {!canBuy && <Alert kind="error">Seu plano no Balcão não está ativo: renove no bot para comprar.</Alert>}
      {canBuy && canEdit && (
        showForm ? (
          rules && <NewOfferForm rules={rules} onClose={() => setShowForm(false)} onCreated={() => { setShowForm(false); void loadOffers(); void loadRules(); }} />
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-primary" disabled={full || !rules} onClick={() => setShowForm(true)}><Plus className="h-4 w-4" />Nova oferta de compra</button>
            {rules && <span className="text-xs text-muted">{rules.ofertas_abertas} de {rules.limite_ofertas} ofertas abertas{full ? ": cancele alguma para abrir outra" : ""}</span>}
          </div>
        )
      )}

      {active === null ? <p className="text-sm text-muted">Carregando suas ofertas…</p>
        : active.length === 0 ? <Empty title="Nenhuma oferta de compra em andamento" icon={<ShoppingCart className="h-5 w-5" />}><p className="text-sm text-muted">Abra uma oferta: ela sai no canal do Balcão e os milheiros mandam proposta. As propostas aparecem aqui na hora.</p></Empty>
        : (
          <div className="space-y-3">
            {active.map((o) => (
              <MyOfferCard key={o.id} o={o} canEdit={canEdit} expanded={open === o.id} proposals={proposals[o.id]}
                onToggle={() => { const next = open === o.id ? null : o.id; setOpen(next); if (next) void loadProposals(next); }}
                onCancel={() => void cancel(o)} onChoose={(p) => void choose(o, p)} />
            ))}
          </div>
        )}

      {past.length > 0 && (
        <details className="card px-4 py-3 text-sm">
          <summary className="cursor-pointer text-muted">Ofertas encerradas ({past.length})</summary>
          <div className="mt-2 divide-y divide-line">
            {past.map((o) => (
              <div key={o.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
                <span className="font-medium">#{o.id} · {o.programa_nome} · {fmtPts(o.milhas)} milhas</span>
                <span>{fmtBRL(o.negociacao?.milheiro_centavos ?? o.milheiro_centavos)} o milheiro</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS[o.status]?.[1] ?? ""}`}>{STATUS[o.status]?.[0] ?? o.status}</span>
                <span className="text-xs text-muted">{fmtDateTime(o.criada_em)}</span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MyOfferCard({ o, canEdit, expanded, proposals, onToggle, onCancel, onChoose }: {
  o: MyOffer; canEdit: boolean; expanded: boolean; proposals: Received[] | undefined;
  onToggle: () => void; onCancel: () => void; onChoose: (p: Received) => void;
}) {
  const [label, tone] = STATUS[o.status] ?? [o.status, ""];
  const d = o.negociacao;
  return (
    <article className="card p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted">Oferta #{o.id} · {o.programa_nome}</p>
          <p className="text-lg font-semibold">{fmtPts(o.milhas)} milhas · {o.cpfs} CPF{o.cpfs > 1 ? "s" : ""}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">{fmtBRL(d?.milheiro_centavos ?? o.milheiro_centavos)}</p>
          <p className="text-xs text-muted">o milheiro · total {fmtBRL(d?.total_centavos ?? o.total_centavos)}</p>
        </div>
      </header>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <span className={`rounded-full px-2 py-0.5 ${tone}`}>{label}</span>
        {o.urgente && <span className="flex items-center gap-1 rounded-full bg-red-400/15 px-2 py-0.5 text-red-300"><Zap className="h-3 w-3" />Voo em menos de 7 dias</span>}
        {o.intermediada && <span className="flex items-center gap-1 rounded-full bg-blue-400/15 px-2 py-0.5 text-blue-300"><ShieldCheck className="h-3 w-3" />Intermediação do balcão</span>}
        {o.status === "open" && <span className="rounded-full bg-panel2 px-2 py-0.5 text-muted">Válida até {fmtDateTime(o.valida_ate)}</span>}
      </div>
      {o.observacao && <p className="mt-2 rounded-lg bg-panel2 px-3 py-2 text-sm">{o.observacao}</p>}

      {o.status === "awaiting_payment" && d && (
        <Alert kind="info">Pague o PIX de <b>{fmtBRL(d.voce_paga_centavos)}</b> ({fmtBRL(d.total_centavos)} das milhas + {fmtBRL(d.taxa_centavos)} de taxa) que o bot do Balcão te mandou. Assim que o pagamento cair, o contato do vendedor é liberado.</Alert>
      )}
      {o.status === "matched" && (
        <Alert kind="info">Negociação liberada: o contato do vendedor está no seu Telegram. Mande o voo e os dados dos passageiros por lá. A conversa por aqui chega na próxima etapa.</Alert>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-2">
        {o.status === "open" && (
          <button type="button" className="btn-ghost" onClick={onToggle}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            {o.propostas_pendentes ? `${o.propostas_pendentes} proposta${o.propostas_pendentes > 1 ? "s" : ""}` : "Nenhuma proposta ainda"}
          </button>
        )}
        {o.status === "open" && canEdit && <button type="button" className="btn-ghost text-red-300" onClick={onCancel}><X className="h-4 w-4" />Cancelar oferta</button>}
        {o.link_bot && <a className="btn-ghost ml-auto" href={o.link_bot} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />Abrir no bot</a>}
      </footer>

      {expanded && o.status === "open" && (
        <div className="mt-3 divide-y divide-line rounded-lg border border-line">
          {!proposals ? <p className="px-3 py-2 text-sm text-muted">Carregando propostas…</p>
            : proposals.length === 0 ? <p className="px-3 py-2 text-sm text-muted">Nenhuma proposta ainda. Elas aparecem aqui na hora.</p>
            : proposals.map((p, i) => (
              <div key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 text-sm">
                <span className="font-semibold">{i + 1}. {fmtBRL(p.valor_centavos)}</span>
                <span className="text-muted">{p.contraproposta ? "contraproposta" : "aceitou o seu valor"} · total {fmtBRL(p.total_centavos)}</span>
                <span className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                  {ROLE[p.vendedor.perfil ?? ""] ?? "membro"}
                  {p.vendedor.verificado && <span className="flex items-center gap-1 text-green-300"><BadgeCheck className="h-3 w-3" />verificado</span>}
                  {p.vendedor.nota != null ? <span className="flex items-center gap-1"><Star className="h-3 w-3" />{p.vendedor.nota.toFixed(1)} ({p.vendedor.avaliacoes})</span> : <span>sem avaliações</span>}
                  <span>{p.vendedor.negociacoes} negociação(ões)</span>
                </span>
                {canEdit && <button type="button" className="btn-primary ml-auto" onClick={() => onChoose(p)}>Escolher</button>}
              </div>
            ))}
        </div>
      )}
    </article>
  );
}

function NewOfferForm({ rules, onClose, onCreated }: { rules: Rules; onClose: () => void; onCreated: () => void }) {
  const [program, setProgram] = useState("");
  const [miles, setMiles] = useState("");
  const [cpfs, setCpfs] = useState("1");
  const [price, setPrice] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [inter, setInter] = useState(rules.intermediacao_obrigatoria);
  const [notes, setNotes] = useState("");
  const [suggestion, setSuggestion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSuggestion(null);
    if (!program) return;
    void api<{ item: { sugestao_centavos: number | null } }>(`/api/balcao/buy?programa=${program}`).then((r) => { if (r.ok) setSuggestion(r.data.item.sugestao_centavos); });
  }, [program]);

  const m = parseMiles(miles);
  const cents = parseBRLToCents(price);
  const total = m && cents ? Math.round((m / 1000) * cents) : null;
  const intermediated = rules.intermediacao_obrigatoria || inter;
  const fee = m && intermediated ? Math.round((m / 1000) * rules.taxa_milheiro_centavos) : 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!program) return toast("Escolha o programa", "error");
    if (!m || m < 1000 || m > 5_000_000) return toast("Milhas entre 1.000 e 5.000.000", "error");
    const n = Number(cpfs);
    if (!Number.isInteger(n) || n < 1 || n > 20) return toast("Passageiros (CPFs) entre 1 e 20", "error");
    if (cents == null || cents < 100 || cents > 50_000) return toast("Valor por milheiro entre R$ 1,00 e R$ 500,00", "error");
    setBusy(true);
    const r = await api<{ item: { offer: MyOffer; alerted: number } }>("/api/balcao/my-offers", "POST", {
      programa: program, milhas: m, cpfs: n, milheiro_centavos: cents, urgente: urgent, intermediada: intermediated, observacao: notes.trim() || null,
    });
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    toast(`Oferta #${r.data.item.offer.id} publicada${r.data.item.alerted ? `: ${r.data.item.alerted} vendedor(es) alertado(s)` : ""}`);
    onCreated();
  }

  return (
    <form onSubmit={submit} className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Nova oferta de compra</h3>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="Fechar"><X className="h-4 w-4" /></button>
      </div>
      <p className="text-xs text-muted">Antes, pesquise o voo no site do programa e veja quantas milhas a emissão custa. A oferta sai no canal do Balcão e vale {rules.validade_horas} horas.</p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm"><span className="text-muted">Programa</span>
          <select className="input" value={program} onChange={(e) => setProgram(e.target.value)} required>
            <option value="">Escolha…</option>
            {rules.programas.map((p) => <option key={p.chave} value={p.chave}>{p.nome}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted">Milhas da emissão</span>
          <input className="input" inputMode="numeric" value={miles} onChange={(e) => setMiles(e.target.value)} placeholder="ex.: 85000 ou 85k" required />
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted">Passageiros (CPFs)</span>
          <input className="input" type="number" min={1} max={20} value={cpfs} onChange={(e) => setCpfs(e.target.value)} required />
        </label>
        <label className="space-y-1 text-sm"><span className="text-muted">Quanto paga o milheiro</span>
          <input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="ex.: 18,50" required />
          {suggestion != null && <button type="button" className="text-xs text-muted underline" onClick={() => setPrice((suggestion / 100).toFixed(2).replace(".", ","))}>Média da semana: {fmtBRL(suggestion)}</button>}
        </label>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />Há voo em menos de 7 dias</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={intermediated} disabled={rules.intermediacao_obrigatoria} onChange={(e) => setInter(e.target.checked)} />
          Intermediação do Balcão{rules.intermediacao_obrigatoria && " (obrigatória no Módulo Viajante)"}</label>
      </div>
      {intermediated && (
        <p className="text-xs text-muted">Você paga ao Balcão, o contato é liberado depois do pagamento e o vendedor só recebe depois da emissão (até {rules.repasse_dias} dias). Taxa: {fmtBRL(rules.taxa_milheiro_centavos)} por milheiro ({rules.taxa_paga_por === "vendedor" ? "paga pelo vendedor" : "somada ao que você paga"}).</p>
      )}
      <label className="block space-y-1 text-sm"><span className="text-muted">Observação (opcional)</span>
        <textarea className="input min-h-[60px]" maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ex.: trecho, data, classe, bagagem" />
        <span className="text-xs text-muted">Não coloque dados pessoais: a oferta é pública no canal.</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button className="btn-primary" disabled={busy}>{busy ? "Publicando…" : "Publicar oferta"}</button>
        {total != null && (
          <span className="text-sm">Total <b>{fmtBRL(total)}</b>{intermediated && rules.taxa_paga_por === "comprador" && <> + taxa {fmtBRL(fee)} = você paga <b>{fmtBRL(total + fee)}</b> ao Balcão</>}</span>
        )}
      </div>
    </form>
  );
}
