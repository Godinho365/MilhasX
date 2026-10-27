"use client";
// Aba "Compras": Lista ou Kanban em 3 estágios (Aguardando entrega → Aguardando pontos → Pontos recebidos)
// e o formulário "Nova compra" como na referência (custos, mais opções e evidências).
import { useRouter } from "next/navigation";
import { refreshSafe } from "@/lib/nav";
import { useEffect, useRef, useState } from "react";
import { ShoppingBag, Plus, Ban, Trash2, MoreHorizontal, Truck, CheckCheck, Undo2, ChevronsLeft, ChevronsRight, Receipt, SlidersHorizontal, Paperclip, Upload, X, Eraser, FileText, Search, List, Columns3 } from "lucide-react";
import { api, today } from "@/lib/api";
import { fmtBRL, fmtDate, fmtPts, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert, Empty } from "@/components/ui";
import { ProgramDot } from "@/components/stat";
import { Collapsible } from "@/components/form-parts";
import { toast, confirmDialog } from "@/components/feedback";
import { fmtSize } from "../programs/holder-dialog";

type Status = "PENDING" | "DELIVERED" | "RECEIVED" | "CANCELED";
export type Purchase = {
  id: string; store: string; description: string | null; account: string; color: string; purchasedAt: string; expectedAt: string | null; expectedDeliveryAt: string | null;
  deliveredAt: string | null; amountCents: number; extraCostCents: number; pointsPerReal: number; expectedPoints: number; status: Status; tags: string[]; files: number;
};
const STAGES: { key: Status; label: string; tone: string }[] = [
  { key: "PENDING", label: "Aguardando entrega", tone: "bg-amber-500" },
  { key: "DELIVERED", label: "Aguardando pontos", tone: "bg-blue-500" },
  { key: "RECEIVED", label: "Pontos recebidos", tone: "bg-green-500" },
];
const STATUS_LABEL: Record<Status, { label: string; cls: string }> = {
  PENDING: { label: "Aguardando entrega", cls: "bg-amber-500/15 text-amber-300" },
  DELIVERED: { label: "Aguardando pontos", cls: "bg-blue-500/15 text-blue-300" },
  RECEIVED: { label: "Pontos recebidos", cls: "bg-green-500/15 text-green-300" },
  CANCELED: { label: "Cancelada", cls: "bg-zinc-500/15 text-muted" },
};
const COST_TYPES = [["DIFERENCA_PRECO", "Diferença de preço"], ["FRETE", "Frete"], ["TAXAS", "Taxas"], ["OUTROS", "Outros"]] as const;
const ACCEPT = "image/png,image/jpeg,image/webp,image/heic,application/pdf,video/mp4,video/quicktime";
const MAX_FILES = 10;
const MAX_TOTAL = 10 * 1024 * 1024;

export function PurchasesPanel({ items, stores, accounts, tagSuggestions }: { items: Purchase[]; stores: { id: string; name: string; bestPointsPerReal: number | null }[]; accounts: { id: string; label: string }[]; tagSuggestions: string[] }) {
  const router = useRouter();
  const [view, setView] = useState<"kanban" | "list">("kanban");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [receiving, setReceiving] = useState<Purchase | null>(null);
  const [collapsed, setCollapsed] = useState<Status[]>([]);
  const [menu, setMenu] = useState<{ p: Purchase; top: number; right: number } | null>(null);
  const [erro, setErro] = useState("");
  const [evidence, setEvidence] = useState<Purchase | null>(null);

  useEffect(() => {
    try {
      const v = localStorage.getItem("mm:compras:view");
      if (v === "list" || v === "kanban") setView(v);
    } catch {}
    const open = () => setCreating(true);
    window.addEventListener("mm:new-purchase", open);
    return () => window.removeEventListener("mm:new-purchase", open);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("scroll", close, true);
    return () => { window.removeEventListener("click", close); window.removeEventListener("scroll", close, true); };
  }, [menu]);
  const pickView = (v: "kanban" | "list") => { setView(v); try { localStorage.setItem("mm:compras:view", v); } catch {} };

  const term = q.trim().toLowerCase();
  const visible = items.filter((p) => !term || [p.store, p.description ?? "", p.account, ...p.tags].some((x) => x.toLowerCase().includes(term)));

  async function move(p: Purchase, stage: "PENDING" | "DELIVERED") {
    const r = await api(`/api/purchases/${p.id}/stage`, "POST", { stage });
    if (!r.ok) return toast(r.erro, "error");
    toast(stage === "DELIVERED" ? "Compra entregue: aguardando pontos" : "Compra voltou para aguardando entrega");
    refreshSafe(router);
  }
  async function receive(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!receiving) return;
    const f = new FormData(e.currentTarget);
    const r = await api(`/api/purchases/${receiving.id}/receive`, "POST", { points: Number(String(f.get("points")).replace(/\D/g, "")), receivedAt: f.get("receivedAt") });
    if (!r.ok) return setErro(r.erro);
    setErro("");
    setReceiving(null);
    toast("Pontos lançados no extrato");
    refreshSafe(router);
  }
  async function cancel(p: Purchase) {
    if (!(await confirmDialog({ title: "Cancelar compra?", body: `${p.store} · ${fmtBRL(p.amountCents)}. Os pontos esperados deixam de ser contados.`, confirmLabel: "Cancelar compra", danger: true }))) return;
    const r = await api(`/api/purchases/${p.id}/cancel`, "POST");
    if (!r.ok) return toast(r.erro, "error");
    toast("Compra cancelada");
    refreshSafe(router);
  }
  async function remove(p: Purchase) {
    if (!(await confirmDialog({ title: "Excluir compra?", body: p.status === "RECEIVED" ? "O lançamento de pontos dela também será excluído do extrato." : undefined, confirmLabel: "Excluir", danger: true }))) return;
    const r = await api(`/api/purchases/${p.id}`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    toast("Compra excluída");
    refreshSafe(router);
  }
  const actions = (p: Purchase) => (
    <button className="btn-subtle h-8 w-8 shrink-0 px-0" aria-label={`Ações da compra ${p.store}`} aria-haspopup="menu"
      onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); setMenu(menu?.p.id === p.id ? null : { p, top: Math.min(r.bottom + 4, window.innerHeight - 220), right: window.innerWidth - r.right }); }}>
      <MoreHorizontal className="h-4 w-4" />
    </button>
  );
  const item = (icon: React.ReactNode, label: string, onClick: () => void, danger = false) => (
    <button role="menuitem" className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-line ${danger ? "text-red-300" : ""}`} onClick={() => { setMenu(null); onClick(); }}>{icon}{label}</button>
  );

  const card = (p: Purchase) => (
    <li key={p.id} className="rounded-xl border border-line bg-panel p-3" aria-label={`Compra ${p.store}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{p.store}</p>
          <p className="flex items-center gap-1.5 truncate text-xs text-muted"><ProgramDot color={p.color} />{p.account}</p>
        </div>
        {actions(p)}
      </div>
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="tabular-nums">{fmtBRL(p.amountCents)}</span>
        <span className={`font-semibold tabular-nums ${p.status === "RECEIVED" ? "text-ok" : "text-amber-300"}`}>+{fmtPts(p.expectedPoints)}</span>
      </div>
      <p className="mt-1 text-xs text-muted">
        Compra {fmtDate(p.purchasedAt)}
        {p.status === "PENDING" && p.expectedDeliveryAt && ` · entrega ${fmtDate(p.expectedDeliveryAt)}`}
        {p.status === "DELIVERED" && p.expectedAt && ` · pontos ${fmtDate(p.expectedAt)}`}
      </p>
      {(p.tags.length > 0 || p.files > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {p.tags.map((t) => <span key={t} className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-zinc-300">{t}</span>)}
          {p.files > 0 && <span className="inline-flex items-center gap-1 text-[11px] text-muted"><Paperclip className="h-3 w-3" />{p.files}</span>}
        </div>
      )}
      {p.status === "PENDING" && <button className="btn-ghost mt-2 h-8 w-full" onClick={() => move(p, "DELIVERED")}><Truck className="h-4 w-4" />Marcar entregue</button>}
      {p.status === "DELIVERED" && <button className="btn-ghost mt-2 h-8 w-full" onClick={() => { setErro(""); setReceiving(p); }}><CheckCheck className="h-4 w-4" />Pontos recebidos</button>}
    </li>
  );

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Visualização">
          {([["list", "Lista", List], ["kanban", "Kanban", Columns3]] as const).map(([k, l, I]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => pickView(k)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium ${view === k ? "bg-panel2 text-white" : "text-muted hover:text-zinc-100"}`}><I className="h-4 w-4" />{l}</button>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input className="input pl-9" placeholder="Buscar compra" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar compra" />
        </div>
        <button className="btn-primary sm:ml-auto" onClick={() => setCreating(true)} disabled={accounts.length === 0}><Plus className="h-4 w-4" />Criar nova compra</button>
      </div>

      {view === "kanban" ? (
        <div className="grid gap-3 md:grid-cols-3" aria-label="Kanban de compras">
          {STAGES.map((s) => {
            const list = visible.filter((p) => p.status === s.key);
            const closed = collapsed.includes(s.key);
            return (
              <section key={s.key} className="rounded-2xl border border-line bg-panel2/40 p-3" aria-label={s.label}>
                <header className="mb-2 flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${s.tone}`} />
                  <h3 className="text-sm font-semibold">{s.label}</h3>
                  <span className="rounded-full bg-panel px-2 text-xs tabular-nums text-muted">{list.length}</span>
                  <button className="btn-subtle ml-auto h-7 w-7 px-0" onClick={() => setCollapsed(closed ? collapsed.filter((x) => x !== s.key) : [...collapsed, s.key])} aria-label={closed ? "Expandir coluna" : "Recolher coluna"}>
                    {closed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
                  </button>
                </header>
                {!closed && (list.length === 0 ? <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">Sem compras neste estágio ainda</p> : <ul className="space-y-2">{list.map(card)}</ul>)}
              </section>
            );
          })}
        </div>
      ) : visible.length === 0 ? (
        <Empty title="Nenhuma compra registrada" icon={<ShoppingBag className="h-5 w-5" />}>
          <p className="max-w-sm text-sm text-muted">Registre suas compras bonificadas para acompanhar os pontos até caírem na conta.</p>
        </Empty>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead><tr><th>Data</th><th>Loja</th><th>Programa</th><th>Estágio</th><th className="text-right">Valor</th><th className="text-right">Pontos</th><th className="w-14 text-right">Ações</th></tr></thead>
              <tbody>
                {visible.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap tabular-nums">{fmtDate(p.purchasedAt)}</td>
                    <td className="max-w-[220px]"><span className="block truncate font-medium">{p.store}</span>{p.tags.length > 0 && <span className="block truncate text-xs text-muted">{p.tags.join(", ")}</span>}</td>
                    <td><span className="flex items-center gap-1.5"><ProgramDot color={p.color} />{p.account}</span></td>
                    <td><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_LABEL[p.status].cls}`}>{STATUS_LABEL[p.status].label}</span></td>
                    <td className="text-right tabular-nums">{fmtBRL(p.amountCents)}</td>
                    <td className="text-right font-semibold tabular-nums">+{fmtPts(p.expectedPoints)}</td>
                    <td className="text-right">{actions(p)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {menu && (
        <div role="menu" style={{ top: menu.top, right: menu.right }} className="fixed z-50 w-56 rounded-xl border border-line bg-panel2 p-1 shadow-xl" onClick={(e) => e.stopPropagation()}>
          {menu.p.status === "PENDING" && item(<Truck className="h-4 w-4" />, "Marcar entregue", () => move(menu.p, "DELIVERED"))}
          {menu.p.status === "DELIVERED" && item(<CheckCheck className="h-4 w-4 text-ok" />, "Pontos recebidos", () => { setErro(""); setReceiving(menu.p); })}
          {menu.p.status === "DELIVERED" && item(<Undo2 className="h-4 w-4" />, "Voltar para aguardando entrega", () => move(menu.p, "PENDING"))}
          {(menu.p.status === "PENDING" || menu.p.status === "DELIVERED") && item(<Ban className="h-4 w-4" />, "Cancelar compra", () => cancel(menu.p))}
          {menu.p.files > 0 && item(<Paperclip className="h-4 w-4" />, "Evidências", () => setEvidence(menu.p))}
          <div className="my-1 border-t border-line" />
          {item(<Trash2 className="h-4 w-4" />, "Excluir", () => remove(menu.p), true)}
        </div>
      )}

      {evidence && <EvidenceDialog purchase={evidence} onClose={() => setEvidence(null)} />}
      {creating && <PurchaseDialog stores={stores} accounts={accounts} tagSuggestions={tagSuggestions} onClose={() => setCreating(false)} />}
      <Modal open={!!receiving} onClose={() => setReceiving(null)} title="Pontos recebidos" size="sm" footer={<><button className="btn-ghost" onClick={() => setReceiving(null)}>Cancelar</button><button form="receive-form" className="btn-primary">Lançar no extrato</button></>}>
        {receiving && (
          <form id="receive-form" onSubmit={receive} className="space-y-4">
            {erro && <Alert>{erro}</Alert>}
            <p className="text-sm text-muted">{receiving.store} · {receiving.account}</p>
            <Field label="Pontos que caíram" required><input className="input" name="points" inputMode="numeric" required defaultValue={fmtPts(receiving.expectedPoints)} /></Field>
            <Field label="Data" required><input className="input" type="date" name="receivedAt" required defaultValue={today()} /></Field>
          </form>
        )}
      </Modal>
    </>
  );
}

/** Campo de tags: digita e Enter (ou vírgula) adiciona; sugere as já usadas. */
export function TagsInput({ value, onChange, suggestions, label = "Tags" }: { value: string[]; onChange: (v: string[]) => void; suggestions: string[]; label?: string }) {
  const [text, setText] = useState("");
  const add = (t: string) => {
    const tag = t.trim().slice(0, 30);
    if (tag && !value.includes(tag) && value.length < 10) onChange([...value, tag]);
    setText("");
  };
  const listId = `tags-${label}`;
  return (
    <div className="input flex min-h-10 flex-wrap items-center gap-1 py-1.5">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-panel2 px-2 py-0.5 text-xs">
          {t}<button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remover tag ${t}`}><X className="h-3 w-3" /></button>
        </span>
      ))}
      <input
        className="min-w-[120px] flex-1 bg-transparent text-sm outline-none"
        list={listId}
        placeholder={value.length ? "" : "Selecionar tags"}
        value={text}
        aria-label={label}
        onChange={(e) => (e.target.value.endsWith(",") ? add(e.target.value.slice(0, -1)) : setText(e.target.value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); add(text); }
          if (e.key === "Backspace" && !text && value.length) onChange(value.slice(0, -1));
        }}
        onBlur={() => text && add(text)}
      />
      <datalist id={listId}>{suggestions.filter((s) => !value.includes(s)).map((s) => <option key={s} value={s} />)}</datalist>
    </div>
  );
}

function PurchaseDialog({ stores, accounts, tagSuggestions, onClose }: { stores: { id: string; name: string; bestPointsPerReal: number | null }[]; accounts: { id: string; label: string }[]; tagSuggestions: string[]; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ accountId: "", date: today(), ppr: "", amount: "", description: "", storeId: "", notes: "", deliveryAt: "", pointsAt: "" });
  const empty = { type: "DIFERENCA_PRECO", amount: "" };
  const [costs, setCosts] = useState([empty]);
  const [tags, setTags] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [open, setOpen] = useState({ costs: false, more: false, files: false });
  const [drag, setDrag] = useState(false);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const amount = parseBRLToCents(f.amount) ?? 0;
  const ppr = Number(f.ppr.replace(",", ".")) || 0;
  const expected = Math.floor((amount / 100) * ppr);
  const costTotal = costs.reduce((t, c) => t + (parseBRLToCents(c.amount) ?? 0), 0);
  const size = files.reduce((t, x) => t + x.size, 0);

  function addFiles(list: FileList | File[]) {
    const next = [...files];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) { toast(`No máximo ${MAX_FILES} arquivos`, "error"); break; }
      if (next.reduce((t, x) => t + x.size, 0) + file.size > MAX_TOTAL) { toast(`${file.name}: as evidências passam de 10 MB`, "error"); continue; }
      if (file.type && !ACCEPT.split(",").includes(file.type)) { toast(`${file.name}: envie PNG, JPEG, WEBP, HEIC, PDF, MP4 ou MOV`, "error"); continue; }
      next.push(file);
    }
    setFiles(next);
  }
  function pickStore(id: string) {
    const s = stores.find((x) => x.id === id);
    setF({ ...f, storeId: id, ppr: s?.bestPointsPerReal && !f.ppr ? String(s.bestPointsPerReal).replace(".", ",") : f.ppr });
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.accountId) return setErro("Selecione o programa");
    if (!ppr) return setErro("Informe os pontos por real");
    if (!amount) return setErro("Informe o valor dos produtos");
    const items = [];
    for (const c of costs) {
      if (!c.amount.trim()) continue;
      const v = parseBRLToCents(c.amount);
      if (v === null) return setErro("Valor de custo inválido");
      items.push({ type: c.type, amountCents: v });
    }
    setBusy(true);
    setErro("");
    const r = await api<{ item: { id: string } }>("/api/purchases", "POST", {
      accountId: f.accountId, storeId: f.storeId || null, storeName: "", description: f.description || null, purchasedAt: f.date,
      amountCents: amount, costs: items, pointsPerReal: Math.round(ppr * 100), expectedAt: f.pointsAt || null, expectedDeliveryAt: f.deliveryAt || null, tags, notes: f.notes || null,
    });
    if (!r.ok) { setBusy(false); return setErro(r.erro); }
    const failures: string[] = [];
    for (const file of files) {
      const res = await fetch(`/api/purchases/${r.data.item.id}/files`, { method: "POST", body: file, headers: { "content-type": file.type || "application/octet-stream", "x-file-name": encodeURIComponent(file.name) } });
      if (!res.ok) failures.push(`${file.name}: ${(await res.json().catch(() => ({}))).erro ?? "falha no envio"}`);
    }
    setBusy(false);
    toast(failures.length ? `Compra registrada, mas: ${failures.join("; ")}` : "Compra registrada", failures.length ? "error" : undefined);
    onClose();
    refreshSafe(router);
  }

  return (
    <Modal open onClose={onClose} title="Nova compra" footer={<><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button form="purchase-form" className="btn-primary" disabled={busy}>{busy ? "Salvando…" : "Criar compra"}</button></>}>
      <form id="purchase-form" onSubmit={save} className="space-y-4">
        {erro && <Alert>{erro}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Programa" required>
            <select className="input" value={f.accountId} onChange={(e) => setF({ ...f, accountId: e.target.value })} aria-label="Programa">
              <option value="" disabled>Selecione</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </Field>
          <Field label="Data da compra" required><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
          <Field label="Pontos por real" required hint={expected > 0 ? `Pontos esperados: ${fmtPts(expected)}` : "Informar pontos esperados"}>
            <input className="input" inputMode="decimal" placeholder="Ex: 1.5" value={f.ppr} onChange={(e) => setF({ ...f, ppr: e.target.value })} aria-label="Pontos por real" />
          </Field>
          <Field label="Valor dos produtos (R$)" required><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} aria-label="Valor dos produtos (R$)" /></Field>
          <Field label="Descrição"><input className="input" maxLength={200} placeholder="Informar descrição" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
          <Field label="Loja parceira">
            <select className="input" value={f.storeId} onChange={(e) => pickStore(e.target.value)} aria-label="Loja parceira">
              <option value="">Selecionar loja</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <Collapsible icon={<Receipt className="h-4 w-4" />} title="Custos" subtitle="Diferença de preço, frete e outros custos da compra." open={open.costs} onToggle={() => setOpen({ ...open, costs: !open.costs })} right={!open.costs && costTotal > 0 ? <span className="text-sm font-semibold tabular-nums">{fmtBRL(costTotal)}</span> : undefined}>
          <div className="space-y-2">
            {costs.map((c, k) => {
              const draft = k === costs.length - 1;
              const upd = (patch: Partial<typeof c>) => { const next = costs.map((x, j) => (j === k ? { ...x, ...patch } : x)); setCosts(next.at(-1)!.amount.trim() ? [...next, empty] : next); };
              return (
                <div key={k} className="grid grid-cols-[1.4fr_1fr_auto] items-end gap-2">
                  <Field label="Tipo"><select className="input" value={c.type} onChange={(e) => upd({ type: e.target.value })} aria-label={`Tipo do custo ${k + 1}`}>{COST_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
                  <Field label="Valor"><input className="input" inputMode="decimal" placeholder="R$ 0,00" value={c.amount} onChange={(e) => upd({ amount: e.target.value })} aria-label={`Valor do custo ${k + 1}`} /></Field>
                  <button type="button" className="btn-subtle mb-0.5 h-10 w-10 px-0" onClick={() => setCosts(draft ? [...costs.slice(0, -1), empty] : costs.filter((_, j) => j !== k))} aria-label={draft ? "Limpar novo custo" : `Remover custo ${k + 1}`}>{draft ? <Eraser className="h-4 w-4" /> : <X className="h-4 w-4" />}</button>
                </div>
              );
            })}
            <p className="text-right text-sm font-semibold tabular-nums">Total: {fmtBRL(costTotal)}</p>
          </div>
        </Collapsible>

        <Collapsible icon={<SlidersHorizontal className="h-4 w-4" />} title="Mais opções" subtitle="Datas previstas, observações e tags." open={open.more} onToggle={() => setOpen({ ...open, more: !open.more })}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Observações" className="sm:col-span-2"><textarea className="input min-h-[70px] py-2" maxLength={1000} placeholder="Detalhes adicionais sobre esta compra" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} aria-label="Observações" /></Field>
            <Field label="Tags" className="sm:col-span-2"><TagsInput value={tags} onChange={setTags} suggestions={tagSuggestions} /></Field>
            <Field label="Entrega prevista" hint="Informar data de entrega"><input className="input" type="date" value={f.deliveryAt} onChange={(e) => setF({ ...f, deliveryAt: e.target.value })} aria-label="Entrega prevista" /></Field>
            <Field label="Pontos previstos"><input className="input" type="date" value={f.pointsAt} onChange={(e) => setF({ ...f, pointsAt: e.target.value })} aria-label="Pontos previstos" /></Field>
          </div>
        </Collapsible>

        <Collapsible icon={<Paperclip className="h-4 w-4" />} title="Evidências" subtitle="Anexe prints, recibos ou vídeos da compra (opcional)" open={open.files} onToggle={() => setOpen({ ...open, files: !open.files })} right={<span className="text-xs text-muted">{fmtSize(size || 0)} / 10,0 MB · {files.length} / {MAX_FILES} arquivos</span>}>
          <div className="space-y-3">
            <button type="button" onClick={() => fileInput.current?.click()} onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }} disabled={files.length >= MAX_FILES}
              className={`flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-6 text-center ${drag ? "border-accent-light bg-accent-soft/30" : "border-line hover:bg-panel2/60"} disabled:opacity-50`}>
              <Upload className="h-5 w-5 text-muted" />
              <span className="text-sm font-medium">Arraste arquivos aqui ou clique para selecionar</span>
              <span className="text-xs text-muted">PNG, JPEG, WEBP, HEIC, PDF, MP4, MOV</span>
              <span className="text-xs text-muted">{files.length} de {MAX_FILES} arquivos · {fmtSize(size || 0)} de 10,0 MB</span>
            </button>
            <input ref={fileInput} type="file" multiple accept={ACCEPT} className="sr-only" aria-label="Selecionar evidências" onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
            {files.length > 0 && <ul className="divide-y divide-line rounded-xl border border-line">{files.map((file, k) => <li key={k} className="flex items-center gap-2 px-3 py-2 text-sm"><FileText className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-muted">{fmtSize(file.size)}</span><button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setFiles(files.filter((_, j) => j !== k))} aria-label={`Remover ${file.name}`}><X className="h-4 w-4" /></button></li>)}</ul>}
            <p className="text-xs text-muted">As alterações são salvas quando você clicar em Criar compra.</p>
          </div>
        </Collapsible>
      </form>
    </Modal>
  );
}

function EvidenceDialog({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const [files, setFiles] = useState<{ id: string; name: string; size: number }[] | null>(null);
  useEffect(() => {
    api<{ items: { id: string; name: string; size: number }[] }>(`/api/purchases/${purchase.id}/files`).then((r) => setFiles(r.ok ? r.data.items : []));
  }, [purchase.id]);
  return (
    <Modal open onClose={onClose} size="sm" title="Evidências" footer={<button className="btn-primary" onClick={onClose}>Fechar</button>}>
      <p className="mb-3 text-sm text-muted">{purchase.store} · {fmtDate(purchase.purchasedAt)}</p>
      {!files ? <p className="text-sm text-muted">Carregando…</p> : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {files.map((f) => <li key={f.id}><a className="flex items-center gap-2 px-3 py-2 text-sm hover:underline" href={`/api/purchases/${purchase.id}/files/${f.id}`}><FileText className="h-4 w-4 text-muted" /><span className="min-w-0 flex-1 truncate">{f.name}</span><span className="text-xs text-muted">{fmtSize(f.size)}</span></a></li>)}
        </ul>
      )}
    </Modal>
  );
}
