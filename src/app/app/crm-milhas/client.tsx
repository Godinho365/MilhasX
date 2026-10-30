"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Coins, MessageCircle, Trash2, Receipt, Link2, ExternalLink, Copy, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { whatsappLink } from "@/domain/orders";
import { BUYER_LABELS, BUYER_TYPES, DEAL_STAGES, DEAL_STAGE_LABELS, dealChargeCents, dealProfitCents, parseDealPaste, type BuyerType, type DealStageKey } from "@/domain/miles-deals";
import type { DealView } from "@/server/services/miles-deals";
import { LATAM_BOOKMARKLET, latamPayload } from "@/domain/latam-fill";
import { PIX_KEY_TYPES, issuedMessage, type PixInfo, type PixKeyType } from "@/domain/deal-message";

type Customer = { id: string; name: string; phone: string | null };
type AccountOpt = { id: string; label: string; balance: number; cpmCents: number | null };

const STAGE_COLOR: Record<DealStageKey, string> = { NEW: "#60a5fa", NEGOTIATION: "#f59e0b", AWAITING: "#a78bfa", ISSUED: "#22c55e", PAID: "#94a3b8" };
const BUYER_CLS: Record<BuyerType, string> = { AGENCY: "bg-blue-500/15 text-blue-300", BALCAO: "bg-amber-500/15 text-amber-300", FINAL: "bg-green-500/15 text-green-300" };
const pts = (n: number) => n.toLocaleString("pt-BR");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/* ---------------- Nova / editar negociação ---------------- */

function DealDialog({ deal, customers, accounts, balcoes, onClose, onMove }: { deal: DealView | null; customers: Customer[]; accounts: AccountOpt[]; balcoes: string[]; onClose: () => void; onMove?: (stage: DealStageKey) => void }) {
  const router = useRouter();
  const [buyerType, setBuyerType] = useState<BuyerType>(deal?.buyerType ?? "FINAL");
  const [customerId, setCustomerId] = useState(deal?.customerId ?? "");
  const [name, setName] = useState(deal?.customerName ?? "");
  const [phone, setPhone] = useState(deal?.customerPhone ?? "");
  const [accountId, setAccountId] = useState(deal?.accountId ?? "");
  const [points, setPoints] = useState(deal?.points ? pts(deal.points) : "");
  const [cpm, setCpm] = useState(deal?.saleCpmCents ? fmtBRL(deal.saleCpmCents) : "");
  const [profitIn, setProfitIn] = useState(deal?.profitManual && deal.profitCents != null ? fmtBRL(deal.profitCents) : ""); // lucro informado à mão
  const [passengers, setPassengers] = useState(deal?.passengers ? String(deal.passengers) : "");
  const [taxes, setTaxes] = useState(deal?.taxesCents != null ? fmtBRL(deal.taxesCents) : "");
  const [orderLink, setOrderLink] = useState(deal?.orderLink ?? "");
  const [locator, setLocator] = useState(deal?.locator ?? "");
  const [paste, setPaste] = useState("");
  const [notes, setNotes] = useState(deal?.notes ?? "");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const locked = !!deal?.saleId; // já virou venda: conta, pontos e milheiro não mudam

  const acc = accounts.find((a) => a.id === accountId);
  const nPoints = Number(points.replace(/\D/g, "")) || null;
  const cpmCents = cpm.trim() ? parseBRLToCents(cpm) : null;
  const taxesCents = taxes.trim() ? parseBRLToCents(taxes) : null;
  const total = dealChargeCents(nPoints, cpmCents, taxesCents);
  const estimated = dealProfitCents(nPoints, cpmCents, acc?.cpmCents ?? null);
  const manualProfit = profitIn.trim() ? parseBRLToCents(profitIn) : null;
  const profit = manualProfit ?? estimated;

  // Colar o que o comprador mandou: link do pedido, "8.673K", "1CPF", "Taxas: R$35,75"
  function onPaste(text: string) {
    setPaste(text);
    const p = parseDealPaste(text);
    if (p.orderLink) setOrderLink(p.orderLink);
    if (p.points && !locked) setPoints(pts(p.points));
    if (p.passengers) setPassengers(String(p.passengers));
    if (p.taxesCents != null && !locked) setTaxes(fmtBRL(p.taxesCents));
  }
  const pasted = paste.trim() ? parseDealPaste(paste) : null;

  function pickCustomer(id: string) {
    setCustomerId(id);
    const c = customers.find((x) => x.id === id);
    if (c) {
      setName(c.name);
      setPhone(c.phone ?? "");
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (cpm.trim() && cpmCents === null) return setErro("Preço do milheiro inválido");
    if (profitIn.trim() && manualProfit === null) return setErro("Lucro inválido");
    if (taxes.trim() && taxesCents === null) return setErro("Taxas inválidas");
    setBusy(true);
    const balcao = buyerType === "BALCAO";
    const body = { buyerType, customerId: balcao ? null : customerId || null, customerName: name, customerPhone: balcao ? null : phone || null, accountId: accountId || null, points: nPoints, saleCpmCents: cpmCents, profitCents: manualProfit, passengers: Number(passengers) || null, taxesCents, orderLink: orderLink.trim() || null, locator: locator.trim() || null, notes: notes || null };
    const r = deal ? await api(`/api/miles-deals/${deal.id}`, "PUT", body) : await api("/api/miles-deals", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    toast(deal ? "Negociação atualizada" : "Negociação criada");
    onClose();
    refreshSafe(router);
  }
  async function remove() {
    if (!deal || !(await confirmDialog({ title: `Excluir a negociação #${deal.number}?`, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/miles-deals/${deal.id}`, "DELETE");
    if (!r.ok) return setErro(r.erro);
    toast("Negociação excluída");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} title={deal ? `Negociação #${deal.number}` : "Nova negociação"} footer={
      <>
        {deal && !locked && <button type="button" className="btn-ghost mr-auto text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}
        <button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button>
        <button form="deal-form" className="btn-primary" disabled={busy}>Salvar</button>
      </>
    }>
      <form id="deal-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        {deal && onMove && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Etapa">
            {DEAL_STAGES.map((s) => (
              <button key={s} type="button" aria-pressed={deal.stage === s} onClick={() => onMove(s)} className={`rounded-lg border px-2.5 py-1 text-xs ${deal.stage === s ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{DEAL_STAGE_LABELS[s]}</button>
            ))}
          </div>
        )}
        {locked && <Alert kind="info">Venda lançada em <Link href="/app/sales" className="underline">Vendas</Link>. Para mudar conta, pontos ou milheiro, exclua a venda lá.</Alert>}
        <Field label="Comprador">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Tipo de comprador">
            {BUYER_TYPES.map((b) => (
              <button key={b} type="button" aria-pressed={buyerType === b} onClick={() => setBuyerType(b)} className={`rounded-lg border px-2.5 py-1 text-sm ${buyerType === b ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>{BUYER_LABELS[b]}</button>
            ))}
          </div>
        </Field>
        {buyerType === "BALCAO" ? (
          <Field label="Nome do balcão" required>
            <input className="input" list="balcoes" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} placeholder="Ex.: HotMilhas" />
            <datalist id="balcoes">{balcoes.map((b) => <option key={b} value={b} />)}</datalist>
          </Field>
        ) : (
          <>
            <Field label="Cliente cadastrado">
              <select className="input" value={customerId} onChange={(e) => pickCustomer(e.target.value)}>
                <option value="">Novo contato (digite abaixo)</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={buyerType === "AGENCY" ? "Nome da agência" : "Nome"} required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} /></Field>
              <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} placeholder="(11) 90000-0000" /></Field>
            </div>
          </>
        )}
        <Field label="Conta de onde saem as milhas">
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)} disabled={locked}>
            <option value="">Escolher depois</option>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.label} · {pts(a.balance)} pts{a.cpmCents ? ` · CPM ${fmtBRL(a.cpmCents)}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Colar pedido do comprador">
          <textarea className="input min-h-14 text-sm" value={paste} onChange={(e) => onPaste(e.target.value)} placeholder="Ex.: link do pedido, 8.673K, 1CPF, Taxas: R$35,75" />
        </Field>
        {pasted && (
          <p className="-mt-2 text-xs text-muted">
            {[pasted.orderLink && "link do pedido", pasted.points && `${pts(pasted.points)} pontos`, pasted.passengers && `${pasted.passengers} CPF${pasted.passengers > 1 ? "s" : ""}`, pasted.taxesCents != null && `taxas ${fmtBRL(pasted.taxesCents)}`].filter(Boolean).join(" · ") || "Nada reconhecido no texto."}
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Pontos"><input className="input" inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value)} disabled={locked} placeholder="0" /></Field>
          <Field label="Milheiro venda (R$)"><input className="input" inputMode="decimal" value={cpm} onChange={(e) => setCpm(e.target.value)} disabled={locked} placeholder="R$ 0,00" /></Field>
          <Field label="Lucro (R$)"><input className="input" inputMode="decimal" value={profitIn} onChange={(e) => setProfitIn(e.target.value)} placeholder={estimated != null ? fmtBRL(estimated) : "R$ 0,00"} title="Vazio: estimado pelos pontos, milheiro e CPM da conta" /></Field>
          <Field label="Passageiros (CPFs)"><input className="input" inputMode="numeric" value={passengers} onChange={(e) => setPassengers(e.target.value.replace(/\D/g, ""))} placeholder="Opcional" /></Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
          <Field label="Taxas (R$)"><input className="input" inputMode="decimal" value={taxes} onChange={(e) => setTaxes(e.target.value)} disabled={locked} placeholder="R$ 0,00" title="Pagas por você na emissão e cobradas do comprador" /></Field>
          <Field label="Link do pedido">
            <div className="flex gap-1.5">
              <input className="input min-w-0 flex-1" value={orderLink} onChange={(e) => setOrderLink(e.target.value)} placeholder="https://…" inputMode="url" />
              {/^https?:\/\//.test(orderLink) && <a href={orderLink} target="_blank" rel="noopener noreferrer" className="btn-ghost h-10 w-10 shrink-0 px-0" aria-label="Abrir o link do pedido"><ExternalLink className="h-4 w-4" /></a>}
            </div>
          </Field>
          <Field label="Localizador"><input className="input uppercase" value={locator} onChange={(e) => setLocator(e.target.value)} maxLength={20} placeholder="Após emitir" /></Field>
        </div>
        <p className="text-sm text-muted">
          {total != null ? <>Total a cobrar: <span className="font-semibold text-zinc-100 tabular-nums">{fmtBRL(total)}</span>{taxesCents ? <span className="text-xs"> (com {fmtBRL(taxesCents)} de taxas)</span> : null}</> : manualProfit == null ? "Informe pontos e milheiro para ver o total, ou digite o lucro." : null}
          {profit != null && <> · {manualProfit != null ? "Lucro" : "Lucro estimado"}: <span className={`font-semibold tabular-nums ${profit >= 0 ? "text-green-300" : "text-red-300"}`}>{fmtBRL(profit)}</span>{manualProfit == null && acc?.cpmCents ? <span className="text-xs"> (CPM da conta {fmtBRL(acc.cpmCents)})</span> : null}</>}
          {acc && nPoints && nPoints > acc.balance ? <span className="block text-xs text-amber-300">A conta tem só {pts(acc.balance)} pontos.</span> : null}
        </p>
        <Field label="Observações"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
        {deal && <BuyerPage deal={deal} />}
        {deal?.locator && <IssuedMessage deal={deal} />}
      </form>
    </Modal>
  );
}

/* ---------------- Mensagem de emissão ---------------- */

/** Emitido: mensagem pronta para o comprador (agradecimento, localizador e PIX). O bilhete é anexado no WhatsApp. */
function IssuedMessage({ deal }: { deal: DealView }) {
  const [pix, setPix] = useState<PixInfo | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [editPix, setEditPix] = useState(false);
  const [form, setForm] = useState<PixInfo>({ keyType: "CPF", key: "", name: "", bank: "" });
  const [text, setText] = useState("");
  const build = (p: PixInfo | null) =>
    // balcão/plataforma: o "comprador" é o nome da plataforma, então a saudação fica sem nome
    issuedMessage({ buyerName: deal.buyerType === "BALCAO" ? "" : deal.customerName, reseller: deal.buyerType !== "FINAL", locator: deal.locator, passengers: deal.passengersData.map((x) => x.name), points: deal.points, taxesCents: deal.taxesCents, chargeCents: deal.chargeCents, pix: p });
  useEffect(() => {
    api<{ item: { pix: PixInfo | null } }>("/api/preferences").then((r) => {
      const p = r.ok ? r.data.item.pix : null;
      setPix(p);
      if (p) setForm(p);
      setEditPix(!p);
      setText(build(p));
      setLoaded(true);
    });
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps
  async function savePix() {
    if (!form.key.trim()) return toast("Informe a chave PIX", "error");
    const r = await api<{ item: { pix: PixInfo | null } }>("/api/preferences", "PATCH", { pix: form });
    if (!r.ok) return toast(r.erro, "error");
    setPix(r.data.item.pix);
    setEditPix(false);
    setText(build(r.data.item.pix));
    toast("Dados do PIX salvos");
  }
  const wa = whatsappLink(deal.customerPhone, text);
  if (!loaded) return null;
  return (
    <section className="space-y-3 rounded-xl border border-line p-3" aria-label="Mensagem de emissão">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Mensagem de emissão</h3>
        <button type="button" className="text-xs text-accent-light hover:underline" onClick={() => setEditPix((v) => !v)}>{pix ? "Editar dados do PIX" : "Cadastrar PIX"}</button>
      </div>
      {editPix && (
        <div className="grid gap-2 rounded-lg bg-panel2 p-3 sm:grid-cols-2" aria-label="Dados do PIX">
          <label className="text-xs"><span className="mb-1 block text-muted">Tipo de chave</span>
            <select className="input h-9" value={form.keyType} onChange={(e) => setForm({ ...form, keyType: e.target.value as PixKeyType })}>
              {Object.entries(PIX_KEY_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="text-xs"><span className="mb-1 block text-muted">Chave PIX</span><input className="input h-9" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} maxLength={140} /></label>
          <label className="text-xs"><span className="mb-1 block text-muted">Nome do recebedor</span><input className="input h-9" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={100} /></label>
          <label className="text-xs"><span className="mb-1 block text-muted">Banco</span><input className="input h-9" value={form.bank} onChange={(e) => setForm({ ...form, bank: e.target.value })} maxLength={60} /></label>
          <div className="flex justify-end gap-2 sm:col-span-2">
            {pix && <button type="button" className="btn-ghost h-8 text-xs" onClick={() => { setForm(pix); setEditPix(false); }}>Cancelar</button>}
            <button type="button" className="btn-primary h-8 text-xs" onClick={savePix}>Salvar PIX</button>
          </div>
        </div>
      )}
      <textarea className="input min-h-[220px] font-mono text-xs leading-relaxed" value={text} onChange={(e) => setText(e.target.value)} aria-label="Texto da mensagem" />
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className="btn-primary h-8 text-xs" onClick={() => navigator.clipboard.writeText(text).then(() => toast("Mensagem copiada"), () => {})}><Copy className="h-3.5 w-3.5" />Copiar mensagem</button>
        {wa && <a className="btn-ghost h-8 text-xs" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-3.5 w-3.5" />Abrir no WhatsApp</a>}
        <button type="button" className="text-xs text-muted hover:text-zinc-100" onClick={() => setText(build(pix))}>Refazer texto</button>
      </div>
      <p className="text-xs text-muted">Anexe o bilhete (PDF ou print) na conversa do WhatsApp antes de enviar.</p>
    </section>
  );
}

/* ---------------- Preencher LATAM ---------------- */

/** Instruções e o favorito para arrastar até a barra de favoritos. O href é posto pelo DOM porque o React
 *  não aceita links "javascript:" (é o que um favorito é). */
function LatamBookmarklet({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => { ref.current?.setAttribute("href", LATAM_BOOKMARKLET); }, []);
  return (
    <Modal open onClose={onClose} title="Favorito Preencher LATAM" footer={<button className="btn-primary" onClick={onClose}>Entendi</button>}>
      <div className="space-y-4 text-sm">
        <p>Instale uma vez e use sempre que for emitir na LATAM:</p>
        <ol className="list-decimal space-y-2 pl-5">
          <li>Mostre a barra de favoritos do navegador (<b>Ctrl + Shift + B</b>).</li>
          <li>Arraste este botão até a barra de favoritos:
            <div className="mt-2"><a ref={ref} draggable onClick={(e) => { e.preventDefault(); toast("Arraste o botão para a barra de favoritos", "error"); }} className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2 font-semibold text-white">✈ Preencher LATAM</a></div>
          </li>
          <li>Aqui no CRM, clique em <b>Copiar para a LATAM</b> na negociação.</li>
          <li>Na tela <b>Passageiros</b> da LATAM, clique no favorito <b>Preencher LATAM</b>. Se o navegador pedir, permita ler a área de transferência.</li>
        </ol>
        <p className="text-xs text-muted">Ele preenche nome, sobrenome, nascimento e CPF de cada passageiro. Nada é enviado: confira o sexo e os demais campos e continue na LATAM.</p>
      </div>
    </Modal>
  );
}

/* ---------------- Página do comprador ---------------- */

const fmtCpf = (v: string) => (v.length === 11 ? `${v.slice(0, 3)}.${v.slice(3, 6)}.${v.slice(6, 9)}-${v.slice(9)}` : v);
const fmtDay = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split("-").reverse().join("/") : v);

function BuyerPage({ deal: initial }: { deal: DealView }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [deal, setDeal] = useState(initial);
  const [checking, setChecking] = useState(false);
  // O comprador envia os passageiros pela página dele: busca de novo ao abrir, ao voltar para a aba
  // e a cada 15 s enquanto não chegam (a janela foi aberta com os dados de quando a página carregou)
  async function reload(manual = false) {
    if (manual) setChecking(true);
    const r = await api<{ item: DealView }>(`/api/miles-deals/${initial.id}`);
    if (manual) setChecking(false);
    if (!r.ok) return manual && toast(r.erro, "error");
    const arrived = r.data.item.passengersData.length > 0 && deal.passengersData.length === 0;
    setDeal(r.data.item);
    if (arrived) { toast("Dados dos passageiros recebidos"); refreshSafe(router); }
    else if (manual && !r.data.item.passengersData.length) toast("Ainda sem dados dos passageiros");
  }
  const waiting = deal.passengersData.length === 0;
  useEffect(() => {
    void reload();
    const onFocus = () => void reload();
    window.addEventListener("focus", onFocus);
    const t = waiting ? window.setInterval(() => void reload(), 15_000) : undefined;
    return () => { window.removeEventListener("focus", onFocus); if (t) window.clearInterval(t); };
  }, [initial.id, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
  async function share(open: boolean) {
    const r = await api<{ token: string; slug: string | null }>(`/api/miles-deals/${deal.id}/share`, "POST");
    if (!r.ok) return toast(r.erro, "error");
    if (!r.data.slug) return toast("Crie sua página em Configurações › Sua MilhasX primeiro", "error");
    const url = `${window.location.origin}/p/${r.data.slug}/emissao/${r.data.token}`;
    setLink(url);
    if (open) return void window.open(url, "_blank", "noopener");
    await navigator.clipboard.writeText(url).catch(() => {});
    toast("Link da página do comprador copiado");
  }
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} copiado`), () => {});
  const [install, setInstall] = useState(false);
  const latamLink = deal.orderLink && /latamairlines\.com/.test(deal.orderLink) ? deal.orderLink : null;
  return (
    <section className="space-y-3 rounded-xl border border-line p-3" aria-label="Página do comprador">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Página do comprador</h3>
        <button type="button" className="btn-ghost h-8 text-xs" onClick={() => share(false)}><Link2 className="h-3.5 w-3.5" />Copiar link</button>
        <button type="button" className="btn-ghost h-8 text-xs" onClick={() => share(true)}><ExternalLink className="h-3.5 w-3.5" />Ver</button>
      </div>
      <p className="text-xs text-muted">O comprador vê o resumo (milhas, CPFs, taxas e total), envia os dados dos passageiros e, com o localizador salvo, vê a emissão confirmada.</p>
      {link && <p className="break-all rounded-lg bg-panel2 px-2.5 py-1.5 font-mono text-[11px] text-muted">{link}</p>}
      {deal.passengersData.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-muted">Recebidos em {new Date(deal.passengersAt!).toLocaleString("pt-BR")}</p>
          <div className="flex flex-wrap items-center gap-2" aria-label="Preencher na LATAM">
            <button type="button" className="btn-primary h-8 text-xs" onClick={() => copy(latamPayload(deal.passengersData), "Passageiros para a LATAM")}><Copy className="h-3.5 w-3.5" />Copiar para a LATAM</button>
            {latamLink && <a className="btn-ghost h-8 text-xs" href={latamLink} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Abrir na LATAM</a>}
            <button type="button" className="text-xs text-accent-light hover:underline" onClick={() => setInstall(true)}>Como preencher sozinho?</button>
          </div>
          {install && <LatamBookmarklet onClose={() => setInstall(false)} />}
          {deal.passengersData.map((p, i) => (
            <div key={i} className="rounded-lg bg-panel2 px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="flex-1 font-semibold">{p.name}</span>
                <button type="button" className="text-muted hover:text-zinc-100" onClick={() => copy(p.name, "Nome")} aria-label={`Copiar nome de ${p.name}`}><Copy className="h-3.5 w-3.5" /></button>
              </div>
              <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted">
                <button type="button" className="hover:text-zinc-100" onClick={() => copy(p.cpf, "CPF")} title="Copiar CPF">CPF {fmtCpf(p.cpf)}</button>
                <button type="button" className="hover:text-zinc-100" onClick={() => copy(fmtDay(p.birthDate), "Nascimento")} title="Copiar nascimento">Nasc. {fmtDay(p.birthDate)}</button>
                {p.gender && <span>{p.gender === "F" ? "Feminino" : "Masculino"}</span>}
                {p.email && <button type="button" className="hover:text-zinc-100" onClick={() => copy(p.email!, "E-mail")} title="Copiar e-mail">{p.email}</button>}
                {p.phone && <span>{p.phone}</span>}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="flex items-center gap-2 text-xs text-amber-300">
          Ainda sem dados dos passageiros.
          <button type="button" className="text-accent-light hover:underline disabled:opacity-60" onClick={() => void reload(true)} disabled={checking}>{checking ? "Verificando…" : "Verificar agora"}</button>
        </p>
      )}
    </section>
  );
}

/* ---------------- Kanban ---------------- */

function Card({ d, onOpen, onDragStart }: { d: DealView; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const wa = whatsappLink(d.customerPhone, `Olá, ${d.customerName.split(/\s+/)[0]}!`);
  return (
    <li draggable onDragStart={onDragStart} className="group relative cursor-grab rounded-xl border border-line bg-panel shadow-sm transition-all hover:-translate-y-0.5 hover:border-zinc-600 hover:shadow-md active:cursor-grabbing" aria-label={`Negociação ${d.number} de ${d.customerName}`}>
      <button type="button" onClick={onOpen} className="w-full p-3 text-left">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-bold text-accent-light" aria-hidden>{initials(d.customerName)}</span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold leading-tight">{d.customerName}</span>
            <span className="block text-[11px] text-muted">#{d.number}</span>
          </span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${BUYER_CLS[d.buyerType]}`}>{BUYER_LABELS[d.buyerType].split(" /")[0]}</span>
        </div>
        <div className="mt-3 rounded-lg bg-panel2/60 px-2.5 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold"><Coins className="h-3.5 w-3.5 shrink-0 text-muted" /><span className="truncate">{d.points ? `${pts(d.points)} pts` : "Pontos a definir"}{d.saleCpmCents ? ` · ${fmtBRL(d.saleCpmCents)}/mil` : ""}</span></p>
          <p className="mt-1 truncate text-[11px] text-muted">{d.accountLabel ?? "Conta a definir"}</p>
        </div>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {d.chargeCents != null && <span className="rounded-full bg-panel2 px-2 py-0.5 font-medium text-zinc-300">{fmtBRL(d.chargeCents)}</span>}
          {d.passengers ? <span className="rounded-full bg-panel2 px-2 py-0.5">{d.passengers} CPF{d.passengers > 1 ? "s" : ""}</span> : null}
          {d.passengersAt && <span className="flex items-center gap-0.5 rounded-full bg-blue-500/15 px-2 py-0.5 text-blue-300"><UserCheck className="h-3 w-3" />dados recebidos</span>}
          {d.locator && <span className="rounded-full bg-panel2 px-2 py-0.5 font-mono">{d.locator}</span>}
          {d.profitCents != null && <span className={`rounded-full px-2 py-0.5 font-medium ${d.profitCents >= 0 ? "bg-green-500/15 text-green-300" : "bg-red-500/15 text-red-300"}`}>lucro {fmtBRL(d.profitCents)}</span>}
          {d.saleId && <span className="flex items-center gap-0.5 rounded-full bg-panel2 px-2 py-0.5"><Receipt className="h-3 w-3" />venda lançada</span>}
        </div>
      </button>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="absolute right-2 top-11 hidden h-7 w-7 items-center justify-center rounded-full border border-line bg-panel text-green-400 shadow-sm hover:bg-panel2 group-hover:flex" aria-label={`WhatsApp de ${d.customerName}`} title="Abrir WhatsApp">
          <MessageCircle className="h-3.5 w-3.5" />
        </a>
      )}
    </li>
  );
}

export function DealsKanban({ deals, customers, accounts }: { deals: DealView[]; customers: Customer[]; accounts: AccountOpt[] }) {
  const router = useRouter();
  const [list, setList] = useState(deals);
  const [over, setOver] = useState<DealStageKey | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [buyer, setBuyer] = useState<"ALL" | BuyerType>("ALL");
  const dragged = useRef<string | null>(null);
  useEffect(() => setList(deals), [deals]);
  useEffect(() => {
    const h = () => setCreating(true);
    window.addEventListener("mm:new-deal", h);
    return () => window.removeEventListener("mm:new-deal", h);
  }, []);

  async function move(id: string, stage: DealStageKey, position?: number) {
    const prev = list;
    setList((l) => l.map((d) => (d.id === id ? { ...d, stage } : d)));
    const r = await api<{ item: DealView }>(`/api/miles-deals/${id}/move`, "POST", { stage, position });
    if (!r.ok) {
      setList(prev);
      return toast(r.erro, "error");
    }
    if (stage === "PAID" && !prev.find((d) => d.id === id)?.saleId) toast("Venda lançada em Vendas");
    refreshSafe(router);
  }
  function drop(e: React.DragEvent, stage: DealStageKey) {
    e.preventDefault();
    setOver(null);
    const id = dragged.current ?? e.dataTransfer.getData("text/plain");
    dragged.current = null;
    if (id) move(id, stage, list.filter((d) => d.stage === stage && d.id !== id).length);
  }
  const q = query.trim().toLowerCase();
  const shown = list.filter((d) => (buyer === "ALL" || d.buyerType === buyer) && (!q || d.customerName.toLowerCase().includes(q) || String(d.number) === q.replace("#", "")));
  const openDeal = list.find((d) => d.id === open) ?? null;
  // Sugestões de nome do balcão: os já usados e as plataformas mais comuns
  const balcoes = [...new Set([...list.filter((d) => d.buyerType === "BALCAO").map((d) => d.customerName), "HotMilhas", "MaxMilhas"])];
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar comprador ou nº" aria-label="Buscar negociações" />
        </label>
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Comprador">
          {([["ALL", "Todos"], ...BUYER_TYPES.map((b) => [b, BUYER_LABELS[b].split(" /")[0]])] as [string, string][]).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={buyer === k} onClick={() => setBuyer(k as typeof buyer)} className={`rounded-lg px-2.5 py-1 text-xs font-medium ${buyer === k ? "bg-panel2 text-white shadow-sm" : "text-muted hover:text-zinc-100"}`}>{l}</button>
          ))}
        </div>
        <button type="button" className="btn-primary ml-auto h-9" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Nova negociação</button>
      </div>
      <div className="-mx-3 overflow-x-auto px-3 pb-3 sm:-mx-5 sm:px-5">
        <div className="flex min-w-max gap-3">
          {DEAL_STAGES.map((stage) => {
            const items = shown.filter((d) => d.stage === stage);
            const total = items.reduce((t, d) => t + (d.chargeCents ?? 0), 0);
            const profit = items.reduce((t, d) => t + (d.profitCents ?? 0), 0);
            return (
              <section key={stage} aria-label={DEAL_STAGE_LABELS[stage]} onDragOver={(e) => { e.preventDefault(); setOver(stage); }} onDragLeave={() => setOver((s) => (s === stage ? null : s))} onDrop={(e) => drop(e, stage)}
                className={`flex w-[290px] shrink-0 flex-col overflow-hidden rounded-2xl border transition-colors ${over === stage ? "border-accent-light bg-accent-soft/40" : "border-line bg-panel2/40"}`}>
                <div className="h-1 shrink-0" style={{ backgroundColor: STAGE_COLOR[stage] }} aria-hidden />
                <h2 className="flex items-center gap-2 px-3 pb-1 pt-3 text-sm font-semibold">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: STAGE_COLOR[stage] }} aria-hidden />
                  <span className="flex-1 truncate">{DEAL_STAGE_LABELS[stage]}</span>
                  <span className="rounded-full bg-panel px-2 py-0.5 text-xs font-medium tabular-nums text-muted">{items.length}</span>
                </h2>
                <p className="px-3 pb-2 text-[11px] text-muted">{total > 0 ? `${fmtBRL(total)} · lucro ${fmtBRL(profit)}` : " "}</p>
                <ul className="max-h-[calc(100vh-320px)] min-h-[120px] flex-1 space-y-2 overflow-y-auto px-2 pb-2" role="list">
                  {items.map((d) => <Card key={d.id} d={d} onOpen={() => setOpen(d.id)} onDragStart={(e) => { dragged.current = d.id; e.dataTransfer.setData("text/plain", d.id); }} />)}
                  {items.length === 0 && <li className="flex h-24 items-center justify-center rounded-xl border border-dashed border-line text-center text-xs text-muted">{q || buyer !== "ALL" ? "Nenhuma negociação com esse filtro." : stage === "PAID" ? "Arraste para cá para lançar a venda" : "Arraste negociações para cá"}</li>}
                </ul>
                {stage === "NEW" && <button type="button" className="mx-2 mb-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line text-sm text-muted transition-colors hover:border-zinc-500 hover:text-zinc-100" onClick={() => setCreating(true)}><Plus className="h-4 w-4" />Adicionar negociação</button>}
              </section>
            );
          })}
        </div>
      </div>
      {creating && <DealDialog deal={null} customers={customers} accounts={accounts} balcoes={balcoes} onClose={() => setCreating(false)} />}
      {openDeal && <DealDialog key={openDeal.id + openDeal.stage} deal={openDeal} customers={customers} accounts={accounts} balcoes={balcoes} onClose={() => setOpen(null)} onMove={(stage) => move(openDeal.id, stage)} />}
    </>
  );
}
