"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Plus, Search, Coins, MessageCircle, Trash2, Receipt, Link2, ExternalLink, Copy, UserCheck, ImageUp } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtPts, parseBRLToCents, fmtDateTime, fmtDay as fmtDayBR } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { toast, confirmDialog } from "@/components/feedback";
import { whatsappLink } from "@/domain/orders";
import { BUYER_LABELS, BUYER_TYPES, DEAL_STAGES, DEAL_STAGE_LABELS, dealChargeCents, dealProfitCents, parseDealPaste, parsePassengersText, type BuyerType, type DealStageKey, type Passenger } from "@/domain/miles-deals";
import type { DealView } from "@/server/services/miles-deals";
import { parseLatamScreen } from "@/domain/latam-screen";
import { LATAM_BOOKMARKLET, LATAM_COPY_BOOKMARKLET, fromLatamPayload, latamPayload } from "@/domain/latam-fill";
import { PIX_KEY_TYPES, issuedMessage, type PixInfo, type PixKeyType } from "@/domain/deal-message";
import { priceOptions, roeOf } from "@/domain/pricing";
import { FACE_CHECK_LABELS, faceCheckMessage, unicoProcessLink, type FaceCheckStatus } from "@/domain/face-check";

type Customer = { id: string; name: string; phone: string | null };
// "2026-11-30" → "30/11/2026" sem passar por fuso (a data da tela não tem horário)
const ymdBR = (v: string) => v.split("-").reverse().join("/");
type AccountOpt = { id: string; label: string; balance: number; cpmCents: number | null };

const STAGE_COLOR: Record<DealStageKey, string> = { NEW: "#60a5fa", NEGOTIATION: "#f59e0b", AWAITING: "#a78bfa", ISSUED: "#22c55e", PAID: "#94a3b8" };
const BUYER_CLS: Record<BuyerType, string> = { AGENCY: "bg-blue-500/15 text-blue-300", BALCAO: "bg-amber-500/15 text-amber-300", FINAL: "bg-green-500/15 text-green-300" };
const pts = (n: number) => n.toLocaleString("pt-BR");
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");

/* ---------------- Nova / editar negociação ---------------- */

function DealDialog({ deal, customers, accounts, balcoes, onClose, onMove, avgSaleCpmCents = null }: { deal: DealView | null; customers: Customer[]; accounts: AccountOpt[]; balcoes: string[]; onClose: () => void; onMove?: (stage: DealStageKey) => void; avgSaleCpmCents?: number | null }) {
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

  // Link do pedido da LATAM (…?orderId=LA9571716CUFU): o orderId vira o localizador, se ainda não houver um
  function changeOrderLink(v: string) {
    setOrderLink(v);
    const id = v.match(/[?&]orderId=([A-Za-z0-9]+)/)?.[1];
    if (id && !locator.trim()) setLocator(id.toUpperCase());
  }
  // Colar o que o comprador mandou: link do pedido, "8.673K", "1CPF", "Taxas: R$35,75" — ou o texto/print
  // da tela da LATAM (trecho, datas, passageiros e preço por passageiro), que vira o link da busca.
  // O que o comprador escreveu explicitamente vale mais que o lido da tela.
  function onPaste(text: string) {
    setPaste(text);
    const p = parseDealPaste(text);
    const t = parseLatamScreen(text);
    const link = p.orderLink ?? t?.link;
    if (link) changeOrderLink(link);
    const pts0 = p.points ?? t?.points;
    if (pts0 && !locked) setPoints(pts(pts0));
    const pax = p.passengers ?? (t?.passengersShown ? t.params.adults : undefined);
    if (pax) setPassengers(String(pax));
    const tax = p.taxesCents ?? t?.taxesCents;
    if (tax != null && !locked) setTaxes(fmtBRL(tax));
  }
  const pasted = paste.trim() ? parseDealPaste(paste) : null;
  const screen = paste.trim() ? parseLatamScreen(paste) : null;

  // Print: texto pela leitura da imagem (OCR) no próprio navegador, sem enviar a imagem a ninguém
  const [ocr, setOcr] = useState<number | null>(null); // progresso 0–100 enquanto lê
  const fileRef = useRef<HTMLInputElement>(null);
  async function readPrint(file: File) {
    if (!file.type.startsWith("image/")) return setErro("Envie uma imagem (print da tela)");
    setErro("");
    setOcr(0);
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("por", 1, { logger: (m: { status: string; progress: number }) => m.status === "recognizing text" && setOcr(Math.round(m.progress * 100)) });
      const { data } = await worker.recognize(file);
      await worker.terminate();
      onPaste([paste.trim(), data.text.trim()].filter(Boolean).join("\n"));
    } catch {
      setErro("Não consegui ler o print. Tente de novo ou cole o texto.");
    } finally {
      setOcr(null);
    }
  }
  function pasteImage(e: React.ClipboardEvent) {
    const img = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (!img) return;
    e.preventDefault();
    readPrint(img);
  }

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
  // Arquivada sai do Kanban e fica na Lista; dá para reabrir
  async function archive(archived: boolean) {
    if (!deal) return;
    const r = await api(`/api/miles-deals/${deal.id}/archive`, "POST", { archived });
    if (!r.ok) return setErro(r.erro);
    toast(archived ? "Negociação arquivada" : "Negociação reaberta");
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
        {deal && !locked && <button type="button" className="btn-ghost text-red-300" onClick={remove}><Trash2 className="h-4 w-4" />Excluir</button>}
        {deal && <button type="button" className="btn-ghost mr-auto" onClick={() => archive(!deal.archivedAt)}>{deal.archivedAt ? "Reabrir" : "Arquivar"}</button>}
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
          <textarea className="input min-h-14 text-sm" value={paste} onChange={(e) => onPaste(e.target.value)} onPaste={pasteImage} disabled={ocr != null} placeholder="Link, texto ou print (Ctrl+V) da tela da LATAM. Ex.: 8.673K, 1CPF, Taxas: R$35,75" />
        </Field>
        <div className="-mt-2 flex flex-wrap items-center gap-2">
          <button type="button" className="btn-ghost h-8 text-xs" onClick={() => fileRef.current?.click()} disabled={ocr != null}><ImageUp className="h-3.5 w-3.5" />{ocr != null ? `Lendo o print… ${ocr}%` : "Enviar print"}</button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) readPrint(f); }} />
          {ocr == null && <span className="text-[11px] text-muted">O print é lido aqui no navegador; confira os campos abaixo antes de salvar.</span>}
        </div>
        {screen && (screen.params.origin || screen.points) ? (
          <div className="-mt-1 rounded-lg bg-panel2 px-3 py-2 text-xs text-muted">
            <p className="text-zinc-200">
              Lido da tela: {[screen.params.origin && `${screen.params.origin} → ${screen.params.destination ?? "?"}`, screen.params.departDate && `${ymdBR(screen.params.departDate)}${screen.params.returnDate ? ` a ${ymdBR(screen.params.returnDate)}` : " (só ida)"}`, screen.passengersShown && `${screen.params.adults} ${screen.params.adults === 1 ? "passageiro" : "passageiros"}`, screen.pointsPerPax && `${pts(screen.pointsPerPax)} milhas${screen.taxesPerPaxCents != null ? ` + ${fmtBRL(screen.taxesPerPaxCents)}` : ""} por passageiro`].filter(Boolean).join(" · ")}
            </p>
            {screen.yearGuessed && <p className="text-amber-300">O print não mostra o dia da semana: o ano foi deduzido pela próxima data. Confira.</p>}
            {!screen.passengersShown && screen.points && <p className="text-amber-300">O print não mostra quantos passageiros: contei 1. Ajuste em Passageiros (CPFs) e nos pontos.</p>}
            {screen.link && !pasted?.orderLink && <p>Link da busca montado: reproduz a pesquisa (não trava a tarifa) e, em milhas, pede login no LATAM Pass.</p>}
          </div>
        ) : pasted ? (
          <p className="-mt-2 text-xs text-muted">
            {[pasted.orderLink && "link do pedido", pasted.points && `${pts(pasted.points)} pontos`, pasted.passengers && `${pasted.passengers} CPF${pasted.passengers > 1 ? "s" : ""}`, pasted.taxesCents != null && `taxas ${fmtBRL(pasted.taxesCents)}`].filter(Boolean).join(" · ") || "Nada reconhecido no texto."}
          </p>
        ) : null}
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
              <input className="input min-w-0 flex-1" value={orderLink} onChange={(e) => changeOrderLink(e.target.value)} placeholder="https://…" inputMode="url" />
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
        {!locked && nPoints ? <AccountSuggestion dealId={deal?.id ?? null} points={nPoints} cpfs={Number(passengers) || 1} accountId={accountId} orderLink={orderLink} chosen={accountId} onPick={setAccountId} /> : null}
        {!locked && acc?.cpmCents && nPoints ? (
          <PriceHelper costCpmCents={acc.cpmCents} avgSaleCpmCents={avgSaleCpmCents} points={nPoints} cpfs={Number(passengers) || 1} currentCpmCents={cpmCents} onPick={(c) => setCpm(fmtBRL(c))} />
        ) : null}
        <Field label="Observações"><textarea className="input min-h-20" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} /></Field>
        {deal && <BuyerPage deal={deal} />}
        {deal && <Emission deal={deal} />}
      </form>
    </Modal>
  );
}

/* ---------------- Bilhete e comprovante ---------------- */

const fmtSize = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
type DealFile = { name: string; size: number; at: string };

/** Anexo da negociação (bilhete ou comprovante): anexar, baixar, trocar e remover. */
function FileBox({ title, what, url, file, hint, doneHint, removable = true, blocked, onChanged }: {
  title: string; what: string; url: string; file: DealFile | null; hint: string; doneHint: string; removable?: boolean; blocked?: string;
  onChanged: (r: { item: DealView; aviso?: string | null }, action: "upload" | "remove") => void;
}) {
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload(f: File) {
    if (f.size > 10 * 1024 * 1024) return toast(`O ${what} passa de 10 MB`, "error");
    setBusy(true);
    const res = await fetch(url, { method: "POST", body: f, headers: { "content-type": f.type || "application/octet-stream", "x-file-name": encodeURIComponent(f.name) } });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return toast(j.erro ?? `Não foi possível anexar o ${what}`, "error");
    onChanged(j, "upload");
  }
  async function remove() {
    if (!(await confirmDialog({ title: `Remover o ${what}?`, body: "O arquivo será apagado.", confirmLabel: "Remover", danger: true }))) return;
    const r = await api<{ item: DealView }>(url, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    onChanged(r.data, "remove");
  }
  return (
    <section className="space-y-2 rounded-xl border border-line p-3" aria-label={title}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">{title}</h3>
        <input ref={input} type="file" accept="application/pdf,image/png,image/jpeg,image/webp,image/heic" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void upload(f); }} aria-label={`Arquivo do ${what}`} />
        {file ? (
          <>
            <a className="btn-ghost h-8 text-xs" href={url}><Receipt className="h-3.5 w-3.5" />Baixar</a>
            <button type="button" className="btn-ghost h-8 text-xs" onClick={() => input.current?.click()} disabled={busy}>Trocar</button>
            {removable && <button type="button" className="btn-ghost h-8 w-8 px-0 text-red-300" onClick={remove} aria-label={`Remover o ${what}`}><Trash2 className="h-3.5 w-3.5" /></button>}
          </>
        ) : (
          <button type="button" className="btn-primary h-8 text-xs" onClick={() => input.current?.click()} disabled={busy || !!blocked}><Plus className="h-3.5 w-3.5" />{busy ? "Enviando…" : `Anexar ${what}`}</button>
        )}
      </div>
      {!file && blocked ? (
        <p className="text-xs text-muted">🔒 {blocked}</p>
      ) : file ? (
        <p className="text-xs text-muted">{file.name} · {fmtSize(file.size)} · anexado em {fmtDateTime(file.at)}. {doneHint}</p>
      ) : (
        <p className="text-xs text-amber-300">{hint}</p>
      )}
    </section>
  );
}

/** Emitida só com o bilhete (aí aparece a mensagem para o comprador); paga só com o comprovante (aí vira venda). */
function Emission({ deal: initial }: { deal: DealView }) {
  const router = useRouter();
  const [deal, setDeal] = useState(initial);
  useEffect(() => setDeal(initial), [initial]);
  const changed = (msgs: { up: string; moved: string; removed: string }) => (r: { item: DealView; aviso?: string | null }, action: "upload" | "remove") => {
    const moved = r.item.stage !== deal.stage;
    setDeal(r.item);
    if (r.aviso) toast(r.aviso, "error");
    else toast(action === "remove" ? msgs.removed : moved ? msgs.moved : msgs.up);
    refreshSafe(router);
  };
  const verified = deal.faceCheck.status === "DONE" || deal.faceCheck.status === "NOT_NEEDED";
  return (
    <>
      <FaceCheck deal={deal} onChanged={(d) => { setDeal(d); refreshSafe(router); }} />
      <FileBox
        title="Bilhete" what="bilhete" url={`/api/miles-deals/${deal.id}/ticket`} file={deal.ticket}
        blocked={verified ? undefined : "Faça a verificação acima (validação facial do titular) antes de anexar o bilhete."}
        hint="Anexe a passagem (PDF ou imagem) depois de emitir: só então a negociação fica Emitida e a mensagem para o comprador aparece."
        doneHint="O comprador pode baixar pela página dele."
        onChanged={changed({ up: "Bilhete anexado", moved: "Bilhete anexado: negociação emitida", removed: "Bilhete removido" })}
      />
      {deal.ticket && <IssuedMessage deal={deal} />}
      {(deal.ticket || deal.receipt) && (
        <FileBox
          title="Comprovante de pagamento" what="comprovante" url={`/api/miles-deals/${deal.id}/receipt`} file={deal.receipt} removable={!deal.saleId}
          hint="Quando o comprador pagar, anexe o comprovante: a negociação vai para Pago e a venda é lançada em Vendas (com o bilhete e o comprovante anexados)."
          doneHint={deal.saleId ? "Venda lançada em Vendas, com o bilhete e o comprovante anexados." : "A venda ainda não foi lançada."}
          onChanged={changed({ up: "Comprovante anexado", moved: "Comprovante anexado: venda lançada em Vendas", removed: "Comprovante removido" })}
        />
      )}
    </>
  );
}

/* ---------------- Milheiro sugerido ---------------- */

/** Preço do milheiro: o mínimo sem prejuízo (custo da conta), a sua média de venda e metas de ROE; clicar preenche. */
function PriceHelper({ costCpmCents, avgSaleCpmCents, points, cpfs, currentCpmCents, onPick }: { costCpmCents: number; avgSaleCpmCents: number | null; points: number; cpfs: number; currentCpmCents: number | null; onPick: (cpmCents: number) => void }) {
  const options = priceOptions({ costCpmCents, avgSaleCpmCents, points, cpfs });
  const roe = currentCpmCents ? roeOf(currentCpmCents, costCpmCents) : null;
  const pct = (v: number | null) => (v == null ? "-" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  return (
    <section className="space-y-2 rounded-xl border border-line p-3" aria-label="Milheiro sugerido">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="mr-auto text-sm font-semibold">Milheiro sugerido</h3>
        {roe != null && (
          <span className={`text-xs ${roe < 0 ? "text-red-300" : "text-muted"}`}>
            O seu: ROE <b className={roe < 0 ? "text-red-300" : "text-zinc-100"}>{pct(roe)}</b> · lucro {fmtBRL(Math.round(((currentCpmCents! - costCpmCents) * points) / 1000))}
          </span>
        )}
      </div>
      <p className="text-xs text-muted">Custo da conta {fmtBRL(costCpmCents)} o milheiro. ROE = lucro ÷ custo dos pontos. Clique para usar o preço.</p>
      <div className="grid gap-2 sm:grid-cols-5">
        {options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => onPick(o.cpmCents)}
            aria-pressed={currentCpmCents === o.cpmCents}
            className={`rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${currentCpmCents === o.cpmCents ? "border-accent-light bg-accent-soft" : "border-line hover:border-zinc-500"}`}
          >
            <span className="block text-muted">{o.label}</span>
            <span className="block text-sm font-semibold tabular-nums">{fmtBRL(o.cpmCents)}</span>
            {!o.key.startsWith("roe") && <span className="block tabular-nums text-muted">ROE {pct(o.roePct)}</span>}
            <span className={`block tabular-nums ${o.profitCents > 0 ? "text-green-300" : "text-muted"}`}>{fmtBRL(o.profitCents)}{o.profitPerCpfCents != null && cpfs > 1 ? ` · ${fmtBRL(o.profitPerCpfCents)}/CPF` : ""}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Sugestão de conta ---------------- */

type Leftover = { points: number; costCents: number | null } | null;
type Fit = { id: string; label: string; already: number; leftover: Leftover; leftoverAfter: Leftover; load: { balance: number; reserved: number; cpfFree: number; ptsPerCpf: number }; fit: { enough: boolean; newCpfs: number; balanceAfter: number; cpfAfter: number; excessAfter: number; cpfShort: boolean } };

/** Qual conta usar: a que dá para emitir sem deixar milhas presas (ver domain/capacity). Usa os pontos e os
 *  passageiros salvos na negociação. */
function AccountSuggestion({ dealId, points, cpfs, accountId, orderLink, chosen, onPick }: { dealId: string | null; points: number; cpfs: number; accountId: string; orderLink: string; chosen: string; onPick: (id: string) => void }) {
  const [data, setData] = useState<{ accounts: Fit[]; points: number; cpfsNeeded: number; avg: { ptsPerCpf: number } } | null>(null);
  // acompanha o que está digitado (pontos, CPFs, conta e link do pedido), com uma pequena espera entre teclas
  useEffect(() => {
    const t = window.setTimeout(() => {
      const q = new URLSearchParams({ points: String(points), cpfs: String(cpfs), ...(dealId ? { dealId } : {}), ...(accountId ? { accountId } : {}), ...(orderLink.trim() ? { orderLink: orderLink.trim() } : {}) });
      api<{ accounts: Fit[]; points: number; cpfsNeeded: number; avg: { ptsPerCpf: number } }>(`/api/miles-deals/fit?${q}`).then((r) => r.ok && setData(r.data));
    }, 350);
    return () => window.clearTimeout(t);
  }, [dealId, points, cpfs, accountId, orderLink]);
  if (!data || !data.accounts.length) return null;
  const top = data.accounts.slice(0, 3);
  const anyFits = data.accounts.some((a) => a.fit.enough && !a.fit.cpfShort);
  const note = (a: Fit) => {
    if (!a.fit.enough) return { tone: "text-red-300", text: `Saldo insuficiente (faltam ${fmtPts(-a.fit.balanceAfter)} milhas)` };
    if (a.fit.cpfShort) return { tone: "text-red-300", text: "Sem CPFs livres para os passageiros" };
    if (a.fit.excessAfter > 0) return { tone: "text-amber-300", text: `Sobram ~${fmtPts(a.fit.excessAfter)} milhas sem CPF para usar` };
    const sobra = a.leftoverAfter ? ` · sobra ${a.leftoverAfter.costCents != null ? fmtBRL(a.leftoverAfter.costCents) : `${fmtPts(a.leftoverAfter.points)} milhas`} (não paga outra emissão)` : "";
    return { tone: a.leftoverAfter ? "text-amber-300" : "text-muted", text: `Depois: ${fmtPts(a.fit.balanceAfter)} milhas e ${a.fit.cpfAfter} CPFs livres${sobra}` };
  };
  return (
    <section className="space-y-2 rounded-xl border border-line p-3" aria-label="Sugestão de conta">
      <p className="text-xs text-muted">
        {!anyFits && <span className="mb-1 block text-amber-300">⚠️ Nenhuma conta tem saldo e CPFs livres para esta emissão sozinha: divida os passageiros entre contas ou reveja os pontos.</span>}
        <b className="text-zinc-200">Sugestão de conta</b> para {fmtPts(data.points)} milhas e {data.cpfsNeeded} {data.cpfsNeeded === 1 ? "CPF" : "CPFs"} (média ~{fmtPts(data.avg.ptsPerCpf)} por emissão): emissão grande vai para a conta com milhas sobrando; pequena, para a com CPFs sobrando.
      </p>
      {top.map((a, i) => {
        const n = note(a);
        return (
          <div key={a.id} className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${chosen === a.id ? "bg-accent-soft" : "bg-panel2"}`}>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{i === 0 && a.fit.enough && !a.fit.cpfShort ? "✅ " : ""}{a.label}</span>
              <span className="block text-xs text-muted">{fmtPts(a.load.balance - a.load.reserved)} milhas livres · {a.load.cpfFree} CPFs livres{a.leftover ? <span className="text-amber-300"> · sobra hoje {a.leftover.costCents != null ? fmtBRL(a.leftover.costCents) : `${fmtPts(a.leftover.points)} milhas`}</span> : null}{a.already ? ` · 👤 ${a.already === 1 ? "passageiro já é beneficiário aqui" : `${a.already} passageiros já são beneficiários aqui`} (não gasta CPF)` : ""}</span>
              <span className={`block text-xs ${n.tone}`}>{n.text}</span>
            </span>
            {chosen === a.id ? <span className="text-xs text-accent-light">Escolhida</span> : <button type="button" className="btn-ghost h-8 text-xs" onClick={() => onPick(a.id)}>{a.fit.enough && !a.fit.cpfShort ? "Usar esta" : "Usar mesmo assim"}</button>}
          </div>
        );
      })}
    </section>
  );
}

/* ---------------- Lista ---------------- */

/** Negociações ativas e arquivadas em tabela; clicar abre a negociação. */
export function DealsList({ active, archived, customers, accounts, avgSaleCpmCents = null }: { active: DealView[]; archived: DealView[]; customers: Customer[]; accounts: AccountOpt[]; avgSaleCpmCents?: number | null }) {
  const [open, setOpen] = useState<string | null>(null);
  const all = [...active, ...archived];
  const deal = all.find((d) => d.id === open) ?? null;
  const balcoes = [...new Set([...all.filter((d) => d.buyerType === "BALCAO").map((d) => d.customerName), "HotMilhas", "MaxMilhas"])];
  const fmtDay = (iso: string) => fmtDayBR(iso);
  const table = (rows: DealView[], empty: string) =>
    rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p> : (
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead><tr><th>Nº</th><th>Comprador</th><th className="hidden md:table-cell">Conta</th><th className="text-right">Milhas</th><th className="hidden text-right sm:table-cell">Milheiro</th><th className="text-right">Total</th><th className="hidden text-right lg:table-cell">Lucro</th><th className="hidden md:table-cell">Etapa</th><th className="hidden lg:table-cell">Criada</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="cursor-pointer hover:bg-panel2" onClick={() => setOpen(d.id)}>
                <td className="tabular-nums">#{d.number}</td>
                <td><span className="font-medium">{d.customerName}</span><span className="block text-xs text-muted">{BUYER_LABELS[d.buyerType]}</span></td>
                <td className="hidden max-w-[180px] truncate md:table-cell">{d.accountLabel ?? "-"}</td>
                <td className="text-right tabular-nums">{d.points ? d.points.toLocaleString("pt-BR") : "-"}</td>
                <td className="hidden text-right tabular-nums sm:table-cell">{d.saleCpmCents ? fmtBRL(d.saleCpmCents) : "-"}</td>
                <td className="text-right tabular-nums">{d.chargeCents != null ? fmtBRL(d.chargeCents) : "-"}</td>
                <td className={`hidden text-right tabular-nums lg:table-cell ${(d.profitCents ?? 0) >= 0 ? "text-ok" : "text-bad"}`}>{d.profitCents != null ? fmtBRL(d.profitCents) : "-"}</td>
                <td className="hidden md:table-cell">{d.archivedAt ? <span className="text-muted">Arquivada em {fmtDay(d.archivedAt)}</span> : DEAL_STAGE_LABELS[d.stage as DealStageKey]}</td>
                <td className="hidden text-muted lg:table-cell">{fmtDay(d.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  return (
    <div className="space-y-4">
      <section className="card overflow-hidden" aria-label="Negociações ativas"><h2 className="border-b border-line px-5 py-3 font-semibold">Negociações ativas <span className="text-muted">{active.length}</span></h2>{table(active, "Nenhuma negociação ativa.")}</section>
      <section className="card overflow-hidden" aria-label="Negociações arquivadas"><h2 className="border-b border-line px-5 py-3 font-semibold">Negociações arquivadas <span className="text-muted">{archived.length}</span></h2>{table(archived, "Nenhuma negociação arquivada.")}</section>
      {deal && <DealDialog key={deal.id + deal.stage + (deal.archivedAt ?? "")} deal={deal} customers={customers} accounts={accounts} balcoes={balcoes} avgSaleCpmCents={avgSaleCpmCents} onClose={() => setOpen(null)} />}
    </div>
  );
}

/* ---------------- Verificação (validação facial) ---------------- */

/** Antes de emitir: a LATAM pede validação facial do titular. O link recebido vira o formato novo, que vai
 *  para o titular; marcar como concluída (ou não pedida) libera o bilhete. */
function FaceCheck({ deal, onChanged }: { deal: DealView; onChanged: (d: DealView) => void }) {
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const fc = deal.faceCheck;
  const preview = link.trim() ? unicoProcessLink(link) : null;
  async function save(body: { link?: string | null; status: FaceCheckStatus | null }, msg: string) {
    setBusy(true);
    const r = await api<{ item: DealView }>(`/api/miles-deals/${deal.id}/face-check`, "POST", body);
    setBusy(false);
    if (!r.ok) return toast(r.erro, "error");
    setLink("");
    toast(msg);
    onChanged(r.data.item);
  }
  const copy = (text: string, what: string) => navigator.clipboard.writeText(text).then(() => toast(`${what} copiado`), () => {});
  // com o telefone do titular cadastrado, o WhatsApp abre direto na conversa dele; sem, você escolhe o contato
  const wa = fc.url ? (whatsappLink(deal.holderPhone, faceCheckMessage(deal.holderName, fc.url)) ?? `https://wa.me/?text=${encodeURIComponent(faceCheckMessage(deal.holderName, fc.url))}`) : null;
  const tone = fc.status === "DONE" ? "text-ok" : fc.status === "NOT_NEEDED" ? "text-muted" : "text-amber-300";
  return (
    <section className="space-y-3 rounded-xl border border-line p-3" aria-label="Verificação">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mr-auto text-sm font-semibold">Verificação · validação facial{deal.holderName ? ` de ${deal.holderName}` : ""}</h3>
        {fc.status && <span className={`text-xs font-medium ${tone}`}>{fc.status === "DONE" ? "✅ " : ""}{FACE_CHECK_LABELS[fc.status]}</span>}
      </div>
      {fc.status === "DONE" || fc.status === "NOT_NEEDED" ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span className="flex-1">{fc.status === "DONE" ? "Titular validado. Volte à página da emissão, atualize (F5) e siga até o pagamento." : "A LATAM não pediu validação nesta emissão."}</span>
          <button type="button" className="text-accent-light hover:underline" onClick={() => save({ status: fc.url ? "PENDING" : null }, "Verificação reaberta")} disabled={busy}>Reabrir</button>
        </div>
      ) : (
        <>
          {!fc.url ? (
            <div className="space-y-2">
              <label className="block text-xs">
                <span className="mb-1 block text-muted">Cole o link de validação que a LATAM mostrou (cadastro.unico.app)</span>
                <input className="input h-9 text-sm" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://cadastro.unico.app/flow/intro?collect-data=true&id=…" aria-label="Link da validação facial" />
              </label>
              {link.trim() && (preview ? <p className="break-all text-xs text-muted">Link novo: <span className="font-mono">{preview.url}</span></p> : <p className="text-xs text-red-300">Link inválido: precisa ser do cadastro.unico.app e ter o id.</p>)}
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-primary h-8 text-xs" disabled={busy || !preview} onClick={() => save({ link, status: "PENDING" }, "Link de validação gerado")}>Gerar link novo</button>
                <button type="button" className="btn-ghost h-8 text-xs" disabled={busy} onClick={() => save({ status: "NOT_NEEDED" }, "Marcado: validação não pedida")}>A LATAM não pediu</button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="break-all rounded-lg bg-panel2 px-2.5 py-1.5 font-mono text-[11px]">{fc.url}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-ghost h-8 text-xs" onClick={() => copy(fc.url!, "Link")}><Copy className="h-3.5 w-3.5" />Copiar link</button>
                <a className="btn-ghost h-8 text-xs" href={fc.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Abrir</a>
                {wa && <a className="btn-ghost h-8 text-xs" href={wa} target="_blank" rel="noopener noreferrer" title={deal.holderPhone ? `WhatsApp de ${deal.holderName}: ${deal.holderPhone}` : "Cadastre o telefone do titular para abrir direto na conversa dele"}><MessageCircle className="h-3.5 w-3.5" />Enviar ao titular</a>}
                <button type="button" className="text-xs text-muted hover:text-zinc-100" disabled={busy} onClick={() => save({ link: null, status: null }, "Link apagado")}>Trocar link</button>
              </div>
              <button type="button" className="btn-primary h-8 w-full text-xs" disabled={busy} onClick={() => save({ status: "DONE" }, "Validação concluída: pode anexar o bilhete")}>Titular concluiu a validação</button>
              {!deal.holderPhone && <p className="text-xs text-muted">Sem telefone do titular: o WhatsApp abre para você escolher o contato. Cadastre em Programas › Titulares.</p>}
              <p className="text-xs text-muted">Depois que o titular concluir: volte à página da emissão na LATAM, atualize (F5) e continue até o pagamento.</p>
            </div>
          )}
        </>
      )}
    </section>
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
  const refCopy = useRef<HTMLAnchorElement>(null);
  useEffect(() => { ref.current?.setAttribute("href", LATAM_BOOKMARKLET); refCopy.current?.setAttribute("href", LATAM_COPY_BOOKMARKLET); }, []);
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
        <p className="text-xs text-muted">Ele preenche nome, sobrenome, nascimento, CPF, sexo, e-mail e telefone de cada passageiro. Nada é enviado: confira e continue na LATAM.</p>
        <div className="space-y-2 border-t border-line pt-4">
          <p><b>O passageiro já está preenchido na LATAM?</b> Use o caminho inverso:</p>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Arraste também este botão para a barra de favoritos:
              <div className="mt-2"><a ref={refCopy} draggable onClick={(e) => { e.preventDefault(); toast("Arraste o botão para a barra de favoritos", "error"); }} className="inline-flex items-center gap-2 rounded-xl border border-line bg-panel2 px-4 py-2 font-semibold">⇩ Copiar da LATAM</a></div>
            </li>
            <li>Na tela <b>Passageiros</b> da LATAM, clique em <b>Copiar da LATAM</b>.</li>
            <li>Aqui na negociação, em <b>Informar passageiros</b>, cole no campo de texto: os passageiros se preenchem sozinhos.</li>
          </ol>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Passageiros informados pelo usuário ---------------- */

type PaxRow = { firstName: string; lastName: string; cpf: string; birthDate: string; gender: "M" | "F" | ""; email: string; phone: string };
const toRow = (p: Passenger): PaxRow => {
  const parts = p.name.trim().split(/\s+/);
  return { firstName: p.firstName ?? parts[0] ?? "", lastName: p.lastName ?? parts.slice(1).join(" "), cpf: p.cpf, birthDate: p.birthDate, gender: p.gender ?? "", email: p.email ?? "", phone: p.phone ?? "" };
};
const emptyRow = (): PaxRow => ({ firstName: "", lastName: "", cpf: "", birthDate: "", gender: "", email: "", phone: "" });

/** O comprador mandou os dados pelo WhatsApp/Telegram: colar a mensagem (o sistema separa os campos) ou digitar. */
function PassengersEditor({ deal, onSaved, onCancel }: { deal: DealView; onSaved: (d: DealView) => void; onCancel: () => void }) {
  const [rows, setRows] = useState<PaxRow[]>(() => (deal.passengersData.length ? deal.passengersData.map(toRow) : Array.from({ length: deal.passengers ?? 1 }, emptyRow)));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (i: number, p: Partial<PaxRow>) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...p } : r)));
  function read(value = text) {
    // texto do favorito "Copiar da LATAM" (passageiros já preenchidos na tela da LATAM) ou mensagem livre
    const found = fromLatamPayload(value) ?? parsePassengersText(value);
    if (!found.length) return toast("Não encontrei CPF ou data de nascimento no texto", "error");
    setRows(found.map(toRow));
    toast(`${found.length} ${found.length === 1 ? "passageiro lido" : "passageiros lidos"}: confira os campos`);
  }
  async function save() {
    const bad = rows.findIndex((r) => !r.firstName.trim() || !r.lastName.trim() || r.cpf.replace(/\D/g, "").length !== 11 || !r.birthDate);
    if (bad >= 0) return toast(`Passageiro ${bad + 1}: preencha nome, sobrenome, CPF (11 dígitos) e nascimento`, "error");
    setBusy(true);
    const passengers = rows.map((r) => ({ ...r, name: `${r.firstName.trim()} ${r.lastName.trim()}`, gender: r.gender || undefined }));
    const res = await api<{ item: DealView }>(`/api/miles-deals/${deal.id}/passengers`, "PUT", { passengers });
    setBusy(false);
    if (!res.ok) return toast(res.erro, "error");
    toast("Passageiros salvos");
    onSaved(res.data.item);
  }
  const inp = "input h-9 text-sm";
  return (
    <div className="space-y-3 rounded-lg bg-panel2 p-3" aria-label="Informar passageiros">
      <label className="block text-xs">
        <span className="mb-1 block text-muted">Colar a mensagem do comprador (WhatsApp, Telegram…) ou o que o favorito <b>Copiar da LATAM</b> copiou</span>
        <textarea className="input min-h-[80px] text-sm" value={text} onChange={(e) => setText(e.target.value)} onPaste={(e) => { const v = e.clipboardData.getData("text"); if (fromLatamPayload(v)) { e.preventDefault(); setText(v); read(v); } }} placeholder={"Nicolas Eduardo Amaral\nCPF 037.355.180-01\nNasc. 23/03/2002"} aria-label="Mensagem do comprador" />
      </label>
      <button type="button" className="btn-ghost h-8 text-xs" onClick={() => read()} disabled={!text.trim()}>Ler texto</button>
      {rows.map((r, i) => (
        <fieldset key={i} className="space-y-2 rounded-lg border border-line p-2">
          <legend className="flex w-full items-center justify-between px-1 text-xs font-semibold">
            <span>Passageiro {i + 1}</span>
            {rows.length > 1 && <button type="button" className="text-muted hover:text-zinc-100" onClick={() => setRows((l) => l.filter((_, j) => j !== i))} aria-label={`Remover passageiro ${i + 1}`}><Trash2 className="h-3.5 w-3.5" /></button>}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <input className={inp} value={r.firstName} onChange={(e) => set(i, { firstName: e.target.value })} placeholder="Nome *" aria-label={`Nome do passageiro ${i + 1}`} />
            <input className={inp} value={r.lastName} onChange={(e) => set(i, { lastName: e.target.value })} placeholder="Sobrenome *" aria-label={`Sobrenome do passageiro ${i + 1}`} />
            <input className={inp} value={r.cpf} onChange={(e) => set(i, { cpf: e.target.value })} placeholder="CPF *" inputMode="numeric" aria-label={`CPF do passageiro ${i + 1}`} />
            <input className={inp} type="date" value={r.birthDate} onChange={(e) => set(i, { birthDate: e.target.value })} aria-label={`Nascimento do passageiro ${i + 1}`} />
            <select className={inp} value={r.gender} onChange={(e) => set(i, { gender: e.target.value as PaxRow["gender"] })} aria-label={`Sexo do passageiro ${i + 1}`}><option value="">Sexo</option><option value="M">Masculino</option><option value="F">Feminino</option></select>
            <input className={inp} value={r.phone} onChange={(e) => set(i, { phone: e.target.value })} placeholder="Telefone" inputMode="tel" aria-label={`Telefone do passageiro ${i + 1}`} />
            <input className={`${inp} sm:col-span-2`} type="email" value={r.email} onChange={(e) => set(i, { email: e.target.value })} placeholder="E-mail" aria-label={`E-mail do passageiro ${i + 1}`} />
          </div>
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-2">
        {rows.length < 9 && <button type="button" className="text-xs text-accent-light hover:underline" onClick={() => setRows((l) => [...l, emptyRow()])}><Plus className="mr-1 inline h-3.5 w-3.5" />Adicionar passageiro</button>}
        <span className="flex-1" />
        <button type="button" className="btn-ghost h-8 text-xs" onClick={onCancel}>Cancelar</button>
        <button type="button" className="btn-primary h-8 text-xs" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar passageiros"}</button>
      </div>
    </div>
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
  const [editingPax, setEditingPax] = useState(false);
  const paxSaved = (d: DealView) => { setDeal(d); setEditingPax(false); refreshSafe(router); };
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
      {editingPax ? (
        <PassengersEditor deal={deal} onSaved={paxSaved} onCancel={() => setEditingPax(false)} />
      ) : deal.passengersData.length > 0 ? (
        <div className="space-y-2">
          <p className="flex items-center gap-2 text-xs text-muted">
            <span className="flex-1">Recebidos em {fmtDateTime(deal.passengersAt!)}</span>
            <button type="button" className="text-accent-light hover:underline" onClick={() => setEditingPax(true)}>Editar passageiros</button>
          </p>
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
          <button type="button" className="text-accent-light hover:underline" onClick={() => setEditingPax(true)}>Informar passageiros</button>
          <button type="button" className="text-accent-light hover:underline" onClick={() => setInstall(true)}>Já está na LATAM?</button>
        </p>
      )}
      {install && deal.passengersData.length === 0 && !editingPax && <LatamBookmarklet onClose={() => setInstall(false)} />}
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
          {d.ticket && <span className="rounded-full bg-accent-soft px-2 py-0.5 text-accent" title={`Bilhete: ${d.ticket.name}`}>Bilhete</span>}
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

export function DealsKanban({ deals, customers, accounts, avgSaleCpmCents = null }: { deals: DealView[]; customers: Customer[]; accounts: AccountOpt[]; avgSaleCpmCents?: number | null }) {
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
      {creating && <DealDialog deal={null} customers={customers} accounts={accounts} balcoes={balcoes} avgSaleCpmCents={avgSaleCpmCents} onClose={() => setCreating(false)} />}
      {openDeal && <DealDialog key={openDeal.id + openDeal.stage} deal={openDeal} customers={customers} accounts={accounts} balcoes={balcoes} avgSaleCpmCents={avgSaleCpmCents} onClose={() => setOpen(null)} onMove={(stage) => move(openDeal.id, stage)} />}
    </>
  );
}
