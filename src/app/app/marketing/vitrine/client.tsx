"use client";
// Vitrine: cards de pacotes feitos a partir das cotações do CRM (ou do zero), publicados em /p/<slug>/vitrine.
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Store, Settings2, Plus, FileText, Pencil, Trash2, ArrowUp, ArrowDown, ExternalLink, Copy, ImagePlus, Eye, EyeOff } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { fmtBRL, fmtDate, parseBRLToCents } from "@/lib/format";
import { Modal, Field, Alert } from "@/components/ui";
import { Switch } from "@/components/form-parts";
import { toast, confirmDialog } from "@/components/feedback";
import { PackageCard } from "@/components/package-card";

type Item = { id: string; orderId: string | null; title: string; destination: string; period: string | null; includes: string[]; description: string | null; priceCents: number | null; priceNote: string | null; installments: string | null; imageVersion: string | null; active: boolean; position: number };
type Settings = { slug: string; active: boolean; title: string | null; profilePublished: boolean } | null;
type Candidate = { id: string; number: number; customer: string; route: string; updatedAt: string };
type Draft = Omit<Item, "id" | "imageVersion" | "position"> & { id?: string; imageVersion?: string | null };

const EMPTY: Draft = { orderId: null, title: "", destination: "", period: null, includes: [], description: null, priceCents: null, priceNote: "por pessoa", installments: null, active: true };

export function ShowcaseClient({ items, settings, candidates }: { items: Item[]; settings: Settings; candidates: Candidate[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Draft | null>(null);
  const [config, setConfig] = useState(false);
  const [pick, setPick] = useState(false);
  const publicUrl = settings ? `${typeof window === "undefined" ? "" : window.location.origin}/p/${settings.slug}/vitrine` : null;

  async function act(p: Promise<{ ok: boolean; erro?: string }>, ok?: string) {
    const r = await p;
    if (!r.ok) return toast(r.erro ?? "Não foi possível", "error");
    if (ok) toast(ok);
    refreshSafe(router);
  }
  async function del(it: Item) {
    if (!(await confirmDialog({ title: `Tirar "${it.title}" da vitrine?`, confirmLabel: "Excluir", danger: true }))) return;
    act(api(`/api/showcase/${it.id}`, "DELETE"), "Card excluído");
  }
  async function fromOrder(c: Candidate) {
    const r = await api<{ item: Draft }>(`/api/showcase/suggest?pedido=${c.id}`);
    if (!r.ok) return toast(r.erro, "error");
    setPick(false);
    setEditing({ ...EMPTY, ...r.data.item });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel2 text-muted"><Store className="h-5 w-5" /></span>
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Vitrine</h1>
          <p className="text-sm text-muted">Pacotes prontos para mostrar aos clientes, feitos a partir das suas cotações.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${settings?.active ? "bg-emerald-500/15 text-emerald-300" : "bg-panel2 text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${settings?.active ? "bg-emerald-400" : "bg-zinc-500"}`} />{settings?.active ? "Publicada" : "Não publicada"}</span>
        {settings?.active && <a href={`/p/${settings.slug}/vitrine`} target="_blank" rel="noreferrer" className="btn-ghost h-9 border border-line"><ExternalLink className="h-4 w-4" />Ver vitrine</a>}
        <button type="button" className="btn-ghost h-9 border border-line" onClick={() => setConfig(true)}><Settings2 className="h-4 w-4" />Configurar</button>
        <button type="button" className="btn-ghost h-9 border border-line" onClick={() => setEditing({ ...EMPTY })}><Plus className="h-4 w-4" />Card em branco</button>
        <button type="button" className="btn-primary h-9" onClick={() => setPick(true)}><FileText className="h-4 w-4" />Publicar cotação</button>
      </div>

      {items.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
          <Store className="h-8 w-8 text-muted" />
          <p className="font-semibold">Sua vitrine está vazia</p>
          <p className="max-w-md text-sm text-muted">Escolha uma cotação do CRM e ela vira um card de pacote, sem o nome do cliente. Você ajusta o texto e a foto antes de publicar.</p>
          <button type="button" className="btn-primary" onClick={() => setPick(true)}><Plus className="h-4 w-4" />Publicar a primeira cotação</button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((it, i) => (
            <div key={it.id} className={it.active ? "" : "opacity-60"}>
              <button type="button" className="block w-full text-left" onClick={() => setEditing(it)} aria-label={`Editar ${it.title}`}><PackageCard it={it} img={it.imageVersion ? `/api/showcase/${it.id}/image?v=${it.imageVersion}` : null} /></button>
              <div className="mt-2 flex items-center gap-1 px-1">
                <span className="mr-auto text-xs text-muted">{it.active ? "Na vitrine" : "Oculto"}</span>
                <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => act(api(`/api/showcase/${it.id}`, "PUT", { ...it, active: !it.active }), it.active ? "Card ocultado" : "Card na vitrine")} aria-label={it.active ? "Ocultar" : "Mostrar na vitrine"} title={it.active ? "Ocultar" : "Mostrar"}>{it.active ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                <button type="button" className="btn-subtle h-8 w-8 px-0" disabled={i === 0} onClick={() => act(api(`/api/showcase/${it.id}/move`, "POST", { dir: -1 }))} aria-label="Mover para antes"><ArrowUp className="h-4 w-4" /></button>
                <button type="button" className="btn-subtle h-8 w-8 px-0" disabled={i === items.length - 1} onClick={() => act(api(`/api/showcase/${it.id}/move`, "POST", { dir: 1 }))} aria-label="Mover para depois"><ArrowDown className="h-4 w-4" /></button>
                <button type="button" className="btn-subtle h-8 w-8 px-0" onClick={() => setEditing(it)} aria-label="Editar"><Pencil className="h-4 w-4" /></button>
                <button type="button" className="btn-subtle h-8 w-8 px-0 text-red-300" onClick={() => del(it)} aria-label="Excluir"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && <ItemDialog draft={editing} onClose={() => setEditing(null)} onSaved={(d) => { setEditing(d); refreshSafe(router); }} />}
      {config && <ConfigDialog settings={settings} publicUrl={publicUrl} onClose={() => setConfig(false)} />}
      {pick && (
        <Modal open onClose={() => setPick(false)} title="Publicar cotação na vitrine" size="md">
          <p className="mb-3 text-sm text-muted">Escolha a cotação. O card leva destino, datas, o que inclui e o preço por pessoa; o nome do cliente não vai para a vitrine.</p>
          {candidates.length === 0 ? <p className="rounded-xl border border-dashed border-line py-8 text-center text-sm text-muted">Nenhuma cotação com voos montados. Monte uma em CRM › pedido › Para o cliente.</p> : (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {candidates.map((c) => (
                <li key={c.id}><button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-panel2/60" onClick={() => fromOrder(c)}>
                  <span className="min-w-0 flex-1"><span className="block font-medium">{c.route}</span><span className="text-xs text-muted">Pedido {c.number} · {c.customer} · {fmtDate(c.updatedAt)}</span></span>
                  <Plus className="h-4 w-4 text-muted" />
                </button></li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </>
  );
}

function ItemDialog({ draft, onClose, onSaved }: { draft: Draft; onClose: () => void; onSaved: (d: Draft) => void }) {
  const [f, setF] = useState({ ...draft, price: draft.priceCents != null ? (draft.priceCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "", inc: draft.includes.join(", ") });
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const includes = f.inc.split(",").map((x) => x.trim()).filter(Boolean);
  const priceCents = f.price.trim() ? parseBRLToCents(f.price) : null;

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (f.price.trim() && priceCents === null) return setErro("Preço inválido");
    setBusy(true);
    const body = { title: f.title, destination: f.destination, period: f.period || null, includes, description: f.description || null, priceCents, priceNote: f.priceNote || null, installments: f.installments || null, active: f.active, orderId: f.orderId };
    const r = f.id ? await api(`/api/showcase/${f.id}`, "PUT", body) : await api<{ id: string }>("/api/showcase", "POST", body);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    const id = f.id ?? (r.data as { id: string }).id;
    toast(f.id ? "Card salvo" : "Card publicado. Se quiser, coloque uma foto.");
    setErro("");
    set({ id });
    onSaved({ ...f, id, includes, priceCents });
  }
  async function upload(file: File | undefined) {
    if (!file || !f.id) return;
    const r = await fetch(`/api/showcase/${f.id}/image`, { method: "POST", body: file });
    const j = (await r.json().catch(() => ({}))) as { erro?: string };
    if (!r.ok) return toast(j.erro ?? "Não foi possível enviar a foto", "error");
    const v = String(Date.now());
    set({ imageVersion: v });
    onSaved({ ...f, imageVersion: v, includes, priceCents });
  }
  async function removeImage() {
    if (!f.id) return;
    const r = await api(`/api/showcase/${f.id}/image`, "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    set({ imageVersion: null });
    onSaved({ ...f, imageVersion: null, includes, priceCents });
  }
  const img = f.id && f.imageVersion ? `/api/showcase/${f.id}/image?v=${f.imageVersion}` : null;
  return (
    <Modal open onClose={onClose} size="lg" title={f.id ? "Editar card" : "Novo card da vitrine"}
      footer={<><button type="button" className="btn-ghost" onClick={onClose}>Fechar</button><button type="submit" form="showcase-form" className="btn-primary" disabled={busy}>{f.id ? "Salvar" : "Publicar card"}</button></>}>
      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <form id="showcase-form" onSubmit={save} className="grid gap-3 sm:grid-cols-2">
          {erro && <div className="sm:col-span-2"><Alert>{erro}</Alert></div>}
          <Field label="Título" required className="sm:col-span-2"><input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} maxLength={120} placeholder="Ex.: Lisboa saindo de São Paulo" /></Field>
          <Field label="Destino" required><input className="input" value={f.destination} onChange={(e) => set({ destination: e.target.value })} maxLength={80} placeholder="Lisboa" /></Field>
          <Field label="Período"><input className="input" value={f.period ?? ""} onChange={(e) => set({ period: e.target.value })} maxLength={80} placeholder="16 a 23 de nov" /></Field>
          <Field label="O que inclui" hint="Separe por vírgula (até 8)" className="sm:col-span-2"><input className="input" value={f.inc} onChange={(e) => set({ inc: e.target.value })} placeholder="Aéreo ida e volta, Bagagem despachada" /></Field>
          <Field label="Preço (R$)"><input className="input" inputMode="decimal" value={f.price} onChange={(e) => set({ price: e.target.value })} placeholder="2.890,00" /></Field>
          <Field label="Complemento do preço"><input className="input" value={f.priceNote ?? ""} onChange={(e) => set({ priceNote: e.target.value })} maxLength={60} placeholder="por pessoa" /></Field>
          <Field label="Parcelamento" className="sm:col-span-2"><input className="input" value={f.installments ?? ""} onChange={(e) => set({ installments: e.target.value })} maxLength={60} placeholder="ou em até 10x no cartão" /></Field>
          <Field label="Descrição" className="sm:col-span-2"><textarea className="input min-h-[72px]" value={f.description ?? ""} onChange={(e) => set({ description: e.target.value })} maxLength={1000} placeholder="Detalhes do pacote para o cliente" /></Field>
          <div className="sm:col-span-2"><Switch checked={f.active} onChange={(v) => set({ active: v })} label="Mostrar na vitrine" /></div>
        </form>
        <div className="space-y-3">
          <p className="kicker">Como fica</p>
          <PackageCard it={{ ...f, includes, priceCents }} img={img} />
          {f.id ? (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost h-9 flex-1 border border-line" onClick={() => fileRef.current?.click()}><ImagePlus className="h-4 w-4" />{img ? "Trocar foto" : "Colocar foto"}</button>
              {img && <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={removeImage} aria-label="Tirar foto"><Trash2 className="h-4 w-4" /></button>}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
            </div>
          ) : <p className="text-xs text-muted">Depois de publicar o card, dá para colocar uma foto do destino (JPG, PNG ou WebP até 2 MB).</p>}
        </div>
      </div>
    </Modal>
  );
}

function ConfigDialog({ settings, publicUrl, onClose }: { settings: Settings; publicUrl: string | null; onClose: () => void }) {
  const router = useRouter();
  const [active, setActive] = useState(settings?.active ?? false);
  const [title, setTitle] = useState(settings?.title ?? "");
  const [erro, setErro] = useState("");
  async function save() {
    const r = await api("/api/showcase/settings", "PUT", { active, title: title || null });
    if (!r.ok) return setErro(r.erro);
    toast(active ? "Vitrine publicada" : "Vitrine desligada");
    onClose();
    refreshSafe(router);
  }
  return (
    <Modal open onClose={onClose} size="sm" title="Vitrine pública" footer={settings ? <><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button type="button" className="btn-primary" onClick={save}>Salvar</button></> : undefined}>
      {!settings ? (
        <p className="text-sm text-muted">A vitrine usa o mesmo endereço do site da agência. Escolha o endereço primeiro em <Link href="/app/marketing/site" className="text-accent-light hover:underline">Marketing › Site</Link>.</p>
      ) : (
        <div className="space-y-4">
          {erro && <Alert>{erro}</Alert>}
          <p className="text-sm text-muted">Compartilhe o endereço com quem quiser: os cards visíveis aparecem sem login.</p>
          <Field label="Endereço da vitrine" hint="Para mudar, troque o endereço na Central de atendimento">
            <span className="flex gap-2"><input className="input font-mono text-xs" readOnly value={publicUrl ?? ""} /><button type="button" className="btn-ghost h-10 border border-line" onClick={() => publicUrl && navigator.clipboard.writeText(publicUrl).then(() => toast("Endereço copiado"))} aria-label="Copiar endereço"><Copy className="h-4 w-4" /></button></span>
          </Field>
          <Field label="Título da vitrine"><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Pacotes em destaque" /></Field>
          <Switch checked={active} onChange={setActive} label="Vitrine pública ativa" hint="Desligada, o endereço responde “não encontrada”." />
        </div>
      )}
    </Modal>
  );
}
