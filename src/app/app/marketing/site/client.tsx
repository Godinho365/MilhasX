"use client";
// Montador do site: galeria de temas (com prévia) e editor de páginas por seções, com prévia ao vivo.
// O conteúdo é o mesmo em todos os temas: trocar de tema só muda o visual.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowDown, ArrowUp, Check, ChevronDown, Copy, ExternalLink, Eye, Globe, ImagePlus, LayoutTemplate, Monitor, Palette, Plus, Send, Smartphone, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { refreshSafe } from "@/lib/nav";
import { Modal, Field, Alert } from "@/components/ui";
import { Switch } from "@/components/form-parts";
import { toast, confirmDialog } from "@/components/feedback";
import { SiteView, type SitePackage } from "@/components/site/site-view";
import { FacebookIcon, InstagramIcon, MailIcon, TiktokIcon, WhatsappIcon } from "@/components/site/site-icons";
import { blankSection, PAGE_LABELS, SECTION_LABELS, SITE_PAGES, type Section, type SectionType, type SiteContent, type SitePage } from "@/domain/site";
import { SITE_THEMES, sampleContent, themeById, type SiteTheme } from "@/domain/site-themes";

type Site = { slug: string | null; exists: boolean; theme: string | null; published: boolean; content: SiteContent; canRequest: boolean };
type Pkg = SitePackage & { active: boolean };

const ownImg = (id: string) => `/api/site/images/${id}`;
const ownPkgImg = (p: SitePackage) => (p.imageVersion ? `/api/showcase/${p.id}/image?v=${p.imageVersion}` : null);
const slugify = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Prévia do site num tamanho de tela (computador ou celular), reduzida para caber no espaço. */
function Preview({ theme, content, page, packages, device, onNav, height, requestHref = null }: { theme: SiteTheme; content: SiteContent; page: SitePage; packages: SitePackage[]; device: "desktop" | "phone"; onNav?: (p: SitePage) => void; height: number; requestHref?: string | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const width = device === "phone" ? 390 : 1280;
  const zoom = Math.min(1, (w - 2) / width);
  return (
    <div ref={box} className="overflow-hidden rounded-xl border border-line" style={{ height, backgroundColor: "#e5e5e5" }}>
      <div style={{ width: width * zoom, height, margin: "0 auto", overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ width, zoom } as React.CSSProperties}>
          <SiteView ctx={{ theme, content, page, packages, href: () => "#", img: ownImg, pkgImg: ownPkgImg, requestHref, onNav, slug: null, embedded: true }} />
        </div>
      </div>
    </div>
  );
}

/** Miniatura estática do tema na galeria. */
function ThemeThumb({ theme }: { theme: SiteTheme }) {
  const content = useMemo(() => sampleContent(theme), [theme]);
  return (
    <div className="pointer-events-none overflow-hidden" style={{ height: 260 }} aria-hidden inert>
      <div style={{ width: 1280, zoom: 0.3 } as React.CSSProperties}>
        <SiteView ctx={{ theme, content, page: "inicio", packages: [], href: () => "#", img: ownImg, pkgImg: () => null, requestHref: null, slug: null, embedded: true }} />
      </div>
    </div>
  );
}

function ThemeGallery({ current, onPick, onClose }: { current: string | null; onPick: (id: string) => void; onClose?: () => void }) {
  const [preview, setPreview] = useState<SiteTheme | null>(null);
  const [page, setPage] = useState<SitePage>("inicio");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  return (
    <>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="kicker">Modelos</p>
          <h1 className="text-2xl font-semibold tracking-tight">Escolha o tema do seu site</h1>
          <p className="text-sm text-muted">{SITE_THEMES.length} temas feitos para agência de turismo. Todos têm as mesmas páginas (Início, Destinos, Sobre e Contato) e dá para trocar depois sem perder o que você escreveu.</p>
        </div>
        {onClose && <button type="button" className="btn-ghost h-9 border border-line" onClick={onClose}><X className="h-4 w-4" />Voltar ao editor</button>}
      </div>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {SITE_THEMES.map((t) => (
          <article key={t.id} className={`card overflow-hidden ${current === t.id ? "ring-2 ring-accent-light" : ""}`}>
            {/* a miniatura tem botões e formulário dentro: por isso não é um <button> (botão dentro de botão é HTML inválido) */}
            <div role="button" tabIndex={0} className="block w-full cursor-pointer text-left" onClick={() => { setPreview(t); setPage("inicio"); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPreview(t); setPage("inicio"); } }} aria-label={`Pré-visualizar ${t.name}`}><ThemeThumb theme={t} /></div>
            <div className="space-y-2 border-t border-line p-4">
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{t.name}</h2>
                <span className="rounded-full bg-panel2 px-2 py-0.5 text-[11px] text-muted">{t.category}</span>
                {current === t.id && <span className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-emerald-300"><Check className="h-3.5 w-3.5" />Em uso</span>}
              </div>
              <p className="text-sm text-muted">{t.description}</p>
              <div className="flex gap-2 pt-1">
                <button type="button" className="btn-ghost h-9 flex-1 border border-line" onClick={() => { setPreview(t); setPage("inicio"); }}><Eye className="h-4 w-4" />Pré-visualizar</button>
                <button type="button" className="btn-primary h-9 flex-1" onClick={() => onPick(t.id)}>{current === t.id ? "Continuar" : "Usar este tema"}</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {preview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/70 p-3 sm:p-6" role="dialog" aria-label={`Prévia do tema ${preview.name}`}>
          <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-panel p-2">
            <span className="px-2 font-semibold">{preview.name}</span>
            <div className="inline-flex gap-0.5 rounded-lg border border-line p-0.5">{SITE_PAGES.map((p) => <button key={p} type="button" aria-pressed={page === p} onClick={() => setPage(p)} className={`rounded-md px-2.5 py-1 text-xs font-medium ${page === p ? "bg-panel2 text-white" : "text-muted"}`}>{PAGE_LABELS[p]}</button>)}</div>
            <div className="inline-flex gap-0.5 rounded-lg border border-line p-0.5"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} className={`rounded-md p-1.5 ${device === "desktop" ? "bg-panel2 text-white" : "text-muted"}`} aria-label="Computador"><Monitor className="h-4 w-4" /></button><button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")} className={`rounded-md p-1.5 ${device === "phone" ? "bg-panel2 text-white" : "text-muted"}`} aria-label="Celular"><Smartphone className="h-4 w-4" /></button></div>
            <span className="flex-1" />
            <button type="button" className="btn-primary h-9" onClick={() => { onPick(preview.id); setPreview(null); }}>Usar este tema</button>
            <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => setPreview(null)} aria-label="Fechar"><X className="h-4 w-4" /></button>
          </div>
          <div className="min-h-0 flex-1"><Preview theme={preview} content={sampleContent(preview)} page={page} packages={[]} device={device} onNav={setPage} height={typeof window === "undefined" ? 700 : window.innerHeight - 150} /></div>
          <p className="mt-2 text-center text-xs text-white/70">Textos de exemplo. No seu site entram os seus dados, fotos e os pacotes da Vitrine.</p>
        </div>
      )}
    </>
  );
}

// ---------------- Campos ----------------

function ImageField({ label, id, onChange }: { label: string; id: string | null; onChange: (id: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    const r = await fetch("/api/site/images", { method: "POST", body: f });
    const j = (await r.json().catch(() => ({}))) as { id?: string; erro?: string };
    setBusy(false);
    if (!r.ok || !j.id) return toast(j.erro ?? "Não foi possível enviar a foto", "error");
    onChange(j.id);
  }
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex items-center gap-2">
        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-lg border border-line bg-panel2">{id && <img src={ownImg(id)} alt="" className="h-full w-full object-cover" />}</div>
        <button type="button" className="btn-ghost h-9 border border-line text-xs" disabled={busy} onClick={() => ref.current?.click()}><ImagePlus className="h-4 w-4" />{busy ? "Enviando…" : id ? "Trocar" : "Enviar foto"}</button>
        {id && <button type="button" className="btn-subtle h-9 w-9 px-0" onClick={() => onChange(null)} aria-label="Tirar foto"><Trash2 className="h-4 w-4" /></button>}
        <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
    </div>
  );
}

function ListField<T extends Record<string, string>>({ items, max, fields, blank, onChange, addLabel }: { items: T[]; max: number; fields: { key: keyof T & string; label: string; area?: boolean }[]; blank: T; onChange: (v: T[]) => void; addLabel: string }) {
  const set = (i: number, k: string, v: string) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="space-y-2 rounded-lg border border-line p-2">
          <div className="flex items-center gap-1"><span className="mr-auto text-[11px] font-semibold text-muted">#{i + 1}</span>
            <button type="button" className="btn-subtle h-7 w-7 px-0" disabled={i === 0} onClick={() => { const n = [...items]; [n[i - 1], n[i]] = [n[i]!, n[i - 1]!]; onChange(n); }} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
            <button type="button" className="btn-subtle h-7 w-7 px-0" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Remover"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
          {fields.map((f) => f.area
            ? <textarea key={f.key} className="input min-h-[60px] text-sm" value={it[f.key] ?? ""} onChange={(e) => set(i, f.key, e.target.value)} placeholder={f.label} aria-label={f.label} />
            : <input key={f.key} className="input h-9 text-sm" value={it[f.key] ?? ""} onChange={(e) => set(i, f.key, e.target.value)} placeholder={f.label} aria-label={f.label} />)}
        </div>
      ))}
      {items.length < max && <button type="button" className="btn-ghost h-8 w-full border border-dashed border-line text-xs" onClick={() => onChange([...items, { ...blank }])}><Plus className="h-3.5 w-3.5" />{addLabel}</button>}
    </div>
  );
}

function SectionFields({ s, onChange }: { s: Section; onChange: (s: Section) => void }) {
  const set = (p: Partial<Section>) => onChange({ ...s, ...p } as Section);
  const text = (k: string, label: string, area = false) => (
    <Field label={label}>{area
      ? <textarea className="input min-h-[72px] text-sm" value={(s as Record<string, unknown>)[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<Section>)} />
      : <input className="input h-9 text-sm" value={(s as Record<string, unknown>)[k] as string} onChange={(e) => set({ [k]: e.target.value } as Partial<Section>)} />}</Field>
  );
  switch (s.type) {
    case "hero": return <div className="space-y-3">{text("eyebrow", "Linha de cima (opcional)")}{text("title", "Título: a promessa principal")}{text("text", "Frase de apoio", true)}{text("button", "Botão principal (leva ao pedido de cotação)")}{text("button2", "Botão do WhatsApp (vazio: sem botão)")}{text("note", "Frase de garantia embaixo dos botões")}<ImageField label="Foto da capa" id={s.imageId} onChange={(imageId) => set({ imageId })} /></div>;
    case "selos": return <div className="space-y-3"><p className="text-xs text-muted">Cadastur, CNPJ e tempo de resposta da aba Marca entram sozinhos aqui. Abaixo, garantias extras.</p><ListField items={s.items} max={6} blank={{ title: "", text: "" }} fields={[{ key: "title", label: "Selo (ex.: Atendimento humano)" }, { key: "text", label: "Detalhe" }]} onChange={(items) => set({ items })} addLabel="Adicionar selo" /></div>;
    case "cotacao": return <div className="space-y-3">{text("title", "Título")}{text("text", "Frase de apoio", true)}{text("button", "Texto do botão de enviar")}<p className="text-xs text-muted">Cada envio vira um pedido em CRM Passagens, com origem “Página pública”, e você recebe uma notificação.</p></div>;
    case "milhas": return <div className="space-y-3">{text("title", "Título")}{text("text", "Frase de apoio", true)}{text("button", "Texto do botão de enviar")}<p className="text-xs text-muted">Cada envio vira um interessado em CRM › Lista › Interessados.</p></div>;
    case "numeros": return <ListField items={s.items} max={4} blank={{ value: "", label: "" }} fields={[{ key: "value", label: "Número (ex.: 12 anos)" }, { key: "label", label: "Legenda" }]} onChange={(items) => set({ items })} addLabel="Adicionar número" />;
    case "pacotes": return <div className="space-y-3">{text("title", "Título")}{text("text", "Frase de apoio")}<Field label="Quantos pacotes mostrar"><input className="input h-9 text-sm" type="number" min={1} max={24} value={s.limit} onChange={(e) => set({ limit: Math.min(24, Math.max(1, Number(e.target.value) || 1)) })} /></Field><p className="text-xs text-muted">Os pacotes vêm dos cards visíveis da <Link href="/app/marketing/vitrine" className="text-accent-light hover:underline">Vitrine</Link>.</p></div>;
    case "diferenciais":
    case "passos": return <div className="space-y-3">{text("title", "Título")}<ListField items={s.items} max={s.type === "passos" ? 5 : 6} blank={{ title: "", text: "" }} fields={[{ key: "title", label: "Título do item" }, { key: "text", label: "Texto", area: true }]} onChange={(items) => set({ items })} addLabel="Adicionar item" /></div>;
    case "depoimentos": return <div className="space-y-3">{text("title", "Título")}<ListField items={s.items} max={6} blank={{ text: "", author: "", place: "" }} fields={[{ key: "text", label: "Depoimento", area: true }, { key: "author", label: "Nome" }, { key: "place", label: "Cidade ou viagem" }]} onChange={(items) => set({ items })} addLabel="Adicionar depoimento" /><p className="text-xs text-muted">Use só depoimentos reais, com autorização do cliente.</p></div>;
    case "texto": return <div className="space-y-3">{text("title", "Título")}{text("text", "Texto (deixe uma linha em branco entre parágrafos)", true)}<ImageField label="Foto" id={s.imageId} onChange={(imageId) => set({ imageId })} /></div>;
    case "galeria": return (
      <div className="space-y-3">{text("title", "Título")}
        <div className="grid grid-cols-3 gap-2">{s.imageIds.map((id, i) => <div key={id} className="relative h-16 overflow-hidden rounded-lg border border-line"><img src={ownImg(id)} alt="" className="h-full w-full object-cover" /><button type="button" className="absolute right-1 top-1 rounded bg-black/60 p-0.5" style={{ color: "#fff" }} onClick={() => set({ imageIds: s.imageIds.filter((_, j) => j !== i) })} aria-label="Tirar foto"><X className="h-3 w-3" /></button></div>)}</div>
        {s.imageIds.length < 8 && <ImageField label="Adicionar foto" id={null} onChange={(id) => id && set({ imageIds: [...s.imageIds, id] })} />}
      </div>
    );
    case "faq": return <div className="space-y-3">{text("title", "Título")}<ListField items={s.items} max={8} blank={{ q: "", a: "" }} fields={[{ key: "q", label: "Pergunta" }, { key: "a", label: "Resposta", area: true }]} onChange={(items) => set({ items })} addLabel="Adicionar pergunta" /></div>;
    case "chamada": return <div className="space-y-3">{text("title", "Título")}{text("text", "Frase de apoio", true)}{text("button", "Texto do botão (abre o WhatsApp)")}</div>;
    case "contato": return <div className="space-y-3">{text("title", "Título")}{text("text", "Frase de apoio", true)}<p className="text-xs text-muted">WhatsApp, e-mail, redes, cidade e horário vêm da aba Marca.</p></div>;
  }
}

// ---------------- Editor ----------------

/** `onLook`: avisa o tema e a cor de destaque atuais (mesmo sem salvar), para a Central de atendimento usar o mesmo visual. */
export function SiteBuilder({ initial, packages, onLook }: { initial: Site; packages: Pkg[]; onLook?: (theme: string | null, accent: string | null, saved: boolean) => void }) {
  const router = useRouter();
  const [theme, setTheme] = useState(initial.theme);
  const [content, setContent] = useState(initial.content);
  const [published, setPublished] = useState(initial.published);
  const [slug, setSlug] = useState(initial.slug ?? slugify(initial.content.brand.name));
  const [tab, setTab] = useState<"marca" | SitePage>("inicio");
  const [open, setOpen] = useState<number | null>(0);
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [gallery, setGallery] = useState(!initial.theme);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState("");
  const saved = useRef(JSON.stringify({ theme: initial.theme, content: initial.content, published: initial.published }));
  const dirty = JSON.stringify({ theme, content, published }) !== saved.current;
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const savedTheme = (JSON.parse(saved.current) as { theme: string | null }).theme;
  useEffect(() => { onLook?.(theme, content.brand.accent, !!savedTheme); }, [theme, content.brand.accent, savedTheme, onLook]);

  const page: SitePage = tab === "marca" ? "inicio" : tab;
  const t = themeById(theme);
  const publicUrl = initial.slug ? `/s/${initial.slug}` : null;
  // Página "Pedir cotação de viagem" da Central: destino dos botões de cotação quando o site não tem o formulário
  const requestHref = initial.canRequest && initial.slug ? `/p/${initial.slug}/solicitar` : null;
  const hasQuoteForm = SITE_PAGES.some((p) => content.pages[p].on && content.pages[p].sections.some((x) => x.type === "cotacao" && x.on));
  const addQuoteForm = () => { setOpen(content.pages[page].sections.length); setSections((ss) => [...ss, blankSection("cotacao")]); };

  async function save(nextPublished = published) {
    if (!theme) return;
    setBusy(true);
    const r = await api<{ item: Site }>("/api/site", "PUT", { slug: initial.slug ? undefined : slug, theme, published: nextPublished, content });
    setBusy(false);
    if (!r.ok) { setErro(r.erro); return toast(r.erro, "error"); }
    setErro("");
    setPublished(nextPublished);
    setContent(r.data.item.content);
    saved.current = JSON.stringify({ theme, content: r.data.item.content, published: nextPublished });
    toast(nextPublished && !published ? "Site publicado" : !nextPublished && published ? "Site fora do ar" : "Site salvo");
    refreshSafe(router);
  }

  const setPage = (p: SitePage, fn: (pc: SiteContent["pages"][SitePage]) => SiteContent["pages"][SitePage]) => setContent((c) => ({ ...c, pages: { ...c.pages, [p]: fn(c.pages[p]) } }));
  const setSections = (fn: (s: Section[]) => Section[]) => setPage(page, (pc) => ({ ...pc, sections: fn(pc.sections) }));
  const setBrand = (p: Partial<SiteContent["brand"]>) => setContent((c) => ({ ...c, brand: { ...c.brand, ...p } }));
  const move = (i: number, d: number) => setSections((ss) => { const n = [...ss]; const j = i + d; if (j < 0 || j >= n.length) return ss; [n[i], n[j]] = [n[j]!, n[i]!]; return n; });

  if (gallery || !theme) {
    return <ThemeGallery current={theme} onClose={theme ? () => setGallery(false) : undefined} onPick={(id) => { setTheme(id); setGallery(false); setTab("inicio"); }} />;
  }

  const sections = content.pages[page].sections;
  const b = content.brand;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-panel2 text-muted"><Globe className="h-5 w-5" /></span>
        <div className="mr-auto">
          <h1 className="text-2xl font-semibold tracking-tight">Site</h1>
          <p className="text-sm text-muted">Tema {t.name} · {t.category}. A Central de atendimento pode usar o mesmo visual.</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${published ? "bg-emerald-500/15 text-emerald-300" : "bg-panel2 text-muted"}`}><span className={`h-1.5 w-1.5 rounded-full ${published ? "bg-emerald-400" : "bg-zinc-500"}`} />{published ? "No ar" : "Rascunho"}</span>
        {publicUrl && published && <a href={publicUrl} target="_blank" rel="noreferrer" className="btn-ghost h-9 border border-line"><ExternalLink className="h-4 w-4" />Ver site</a>}
        <button type="button" className="btn-ghost h-9 border border-line" onClick={() => setGallery(true)}><LayoutTemplate className="h-4 w-4" />Trocar tema</button>
        <button type="button" className="btn-ghost h-9 border border-line" disabled={busy || !dirty} onClick={() => save()}>{dirty ? "Salvar" : "Salvo"}</button>
        <button type="button" className="btn-primary h-9" disabled={busy} onClick={async () => { if (published && !(await confirmDialog({ title: "Tirar o site do ar?", body: "O endereço passa a responder “não encontrado” até você publicar de novo.", confirmLabel: "Tirar do ar" }))) return; save(!published); }}>{published ? "Tirar do ar" : "Publicar"}</button>
      </div>
      {erro && <div className="mb-3"><Alert>{erro}</Alert></div>}

      <div className="grid gap-4 xl:grid-cols-[400px_1fr]">
        <aside className="space-y-3">
          <div className="flex flex-wrap gap-1 rounded-xl border border-line bg-panel p-1" role="tablist" aria-label="Páginas do site">
            <button type="button" role="tab" aria-selected={tab === "marca"} onClick={() => setTab("marca")} className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${tab === "marca" ? "bg-panel2 text-white" : "text-muted"}`}><Palette className="h-3.5 w-3.5" />Marca</button>
            {SITE_PAGES.map((p) => <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => { setTab(p); setOpen(0); }} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${tab === p ? "bg-panel2 text-white" : "text-muted"} ${content.pages[p].on ? "" : "line-through opacity-60"}`}>{PAGE_LABELS[p]}</button>)}
          </div>

          {tab === "marca" ? (
            <div className="card card-pad space-y-3">
              {!initial.slug && (
                <Field label="Endereço do site" hint={`Seu site fica em ${typeof window === "undefined" ? "" : window.location.origin}/s/${slug || "..."}`}><input className="input font-mono text-sm" value={slug} onChange={(e) => setSlug(slugify(e.target.value))} maxLength={40} /></Field>
              )}
              {initial.slug && <Field label="Endereço do site"><span className="flex gap-2"><input className="input font-mono text-xs" readOnly value={`${typeof window === "undefined" ? "" : window.location.origin}/s/${initial.slug}`} /><button type="button" className="btn-ghost h-10 border border-line" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/s/${initial.slug}`).then(() => toast("Endereço copiado"))} aria-label="Copiar endereço"><Copy className="h-4 w-4" /></button></span></Field>}
              <Field label="Nome da agência (opcional)" hint="Aparece no topo e no rodapé. Vazio: só a logo, se houver"><input className="input h-9 text-sm" value={b.name} onChange={(e) => setBrand({ name: e.target.value })} maxLength={60} /></Field>
              <Field label="Frase curta (opcional)"><input className="input h-9 text-sm" value={b.tagline} onChange={(e) => setBrand({ tagline: e.target.value })} maxLength={100} placeholder="Viagens planejadas do seu jeito" /></Field>
              <ImageField label="Logo (opcional)" id={b.logoId} onChange={(logoId) => setBrand({ logoId })} />
              <div className="space-y-2" role="group" aria-label="Contato e redes sociais">
                <p className="label">Contato e redes</p>
                {([
                  ["whatsapp", "WhatsApp", WhatsappIcon, "(11) 90000-0000", "#25d366"],
                  ["instagram", "Instagram", InstagramIcon, "@suaagencia ou o link", "#e1306c"],
                  ["facebook", "Facebook", FacebookIcon, "suaagencia ou o link", "#1877f2"],
                  ["tiktok", "TikTok", TiktokIcon, "@suaagencia ou o link", undefined],
                  ["email", "E-mail", MailIcon, "contato@suaagencia.com.br", undefined],
                ] as const).map(([k, label, Icon, ph, color]) => (
                  <label key={k} className="flex items-center gap-2">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line bg-panel2" style={color ? { color } : undefined} title={label}><Icon size={18} /></span>
                    <input className="input h-9 text-sm" value={b[k]} onChange={(e) => setBrand({ [k]: e.target.value })} placeholder={ph} aria-label={label} inputMode={k === "whatsapp" ? "tel" : k === "email" ? "email" : undefined} maxLength={k === "email" ? 120 : 120} />
                  </label>
                ))}
                <p className="text-xs text-muted">Os ícones aparecem no topo, no rodapé e no contato do site, cada um com o seu link.</p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Cidade"><input className="input h-9 text-sm" value={b.city} onChange={(e) => setBrand({ city: e.target.value })} maxLength={60} placeholder="São Paulo, SP" /></Field>
                <Field label="Horário de atendimento"><input className="input h-9 text-sm" value={b.hours} onChange={(e) => setBrand({ hours: e.target.value })} maxLength={80} placeholder="Seg a sex, 9h às 18h" /></Field>
                <Field label="Tempo de resposta"><input className="input h-9 text-sm" value={b.responseTime} onChange={(e) => setBrand({ responseTime: e.target.value })} maxLength={60} placeholder="Respondemos em até 1 hora" /></Field>
                <Field label="Cadastur (opcional)"><input className="input h-9 text-sm" value={b.cadastur} onChange={(e) => setBrand({ cadastur: e.target.value })} maxLength={30} placeholder="Número do registro" /></Field>
                <Field label="CNPJ (opcional)" className="col-span-2"><input className="input h-9 text-sm" value={b.cnpj} onChange={(e) => setBrand({ cnpj: e.target.value })} maxLength={20} placeholder="00.000.000/0001-00" /></Field>
              </div>
              <p className="text-xs text-muted">Cadastur, CNPJ e tempo de resposta viram selos de confiança logo abaixo da capa. Coloque só dados verdadeiros.</p>
              <Field label="Cor de destaque" hint={`Vazio: a cor do tema ${t.name}`}><span className="flex items-center gap-2"><input type="color" className="h-10 w-12 cursor-pointer rounded-lg border border-line bg-panel" value={b.accent ?? t.colors.accent} onChange={(e) => setBrand({ accent: e.target.value })} aria-label="Cor de destaque" />{b.accent && <button type="button" className="btn-subtle h-8 px-2 text-xs" onClick={() => setBrand({ accent: null })}>Usar a do tema</button>}</span></Field>
            </div>
          ) : (
            <div className="space-y-2">
              {tab !== "inicio" && <div className="card card-pad"><Switch checked={content.pages[tab].on} onChange={(v) => setPage(tab, (pc) => ({ ...pc, on: v }))} label={`Mostrar a página ${PAGE_LABELS[tab]} no menu`} /></div>}
              {!hasQuoteForm && (
                <div className="card card-pad space-y-2 text-xs text-muted">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-zinc-100"><Send className="h-4 w-4 text-accent-light" />Botões “Pedir cotação”</p>
                  <p>{requestHref
                    ? "O site não tem o formulário de cotação, então o botão do topo e o da capa abrem a página “Pedir cotação de viagem” da sua Central de atendimento, com o mesmo tema do site."
                    : "O site não tem o formulário de cotação e a Central de atendimento não está recebendo pedidos, então esses botões abrem o WhatsApp."}</p>
                  <p>Para o cliente pedir sem sair do site, ponha o formulário numa página.</p>
                  <button type="button" className="btn-ghost h-8 border border-line text-xs" onClick={addQuoteForm}><Plus className="h-3.5 w-3.5" />Pôr o formulário nesta página</button>
                </div>
              )}
              {sections.map((s, i) => (
                <div key={i} className={`card overflow-hidden ${s.on ? "" : "opacity-60"}`}>
                  <div className="flex items-center gap-1 px-3 py-2">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
                      <ChevronDown className={`h-4 w-4 shrink-0 text-muted transition-transform ${open === i ? "rotate-180" : ""}`} />
                      <span className="truncate text-sm font-medium">{SECTION_LABELS[s.type].label}</span>
                    </button>
                    <button type="button" className="btn-subtle h-7 w-7 px-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir seção"><ArrowUp className="h-3.5 w-3.5" /></button>
                    <button type="button" className="btn-subtle h-7 w-7 px-0" disabled={i === sections.length - 1} onClick={() => move(i, 1)} aria-label="Descer seção"><ArrowDown className="h-3.5 w-3.5" /></button>
                    <button type="button" role="switch" aria-checked={s.on} aria-label={s.on ? "Ocultar seção" : "Mostrar seção"} title={s.on ? "Ocultar" : "Mostrar"} onClick={() => setSections((ss) => ss.map((x, j) => (j === i ? ({ ...x, on: !x.on } as Section) : x)))} className={`relative mx-1 h-4 w-7 shrink-0 rounded-full ${s.on ? "bg-accent" : "bg-line"}`}><span className={`absolute top-0.5 h-3 w-3 rounded-full shadow ${s.on ? "left-[14px]" : "left-0.5"}`} style={{ backgroundColor: "#fff" }} /></button>
                    <button type="button" className="btn-subtle h-7 w-7 px-0 text-red-300" onClick={async () => { if (await confirmDialog({ title: `Tirar a seção ${SECTION_LABELS[s.type].label}?`, confirmLabel: "Tirar", danger: true })) { setSections((ss) => ss.filter((_, j) => j !== i)); setOpen(null); } }} aria-label="Excluir seção"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  {open === i && <div className="border-t border-line p-3"><p className="mb-3 text-xs text-muted">{SECTION_LABELS[s.type].help}</p><SectionFields s={s} onChange={(ns) => setSections((ss) => ss.map((x, j) => (j === i ? ns : x)))} /></div>}
                </div>
              ))}
              {sections.length < 20 && (
                <label className="card flex items-center gap-2 p-3 text-sm">
                  <Plus className="h-4 w-4 text-muted" />
                  <select className="input h-9 flex-1 text-sm" value="" onChange={(e) => { const type = e.target.value as SectionType; if (!type) return; setSections((ss) => [...ss, blankSection(type)]); setOpen(sections.length); }} aria-label="Adicionar seção">
                    <option value="">Adicionar seção…</option>
                    {(Object.keys(SECTION_LABELS) as SectionType[]).map((k) => <option key={k} value={k}>{SECTION_LABELS[k].label}</option>)}
                  </select>
                </label>
              )}
            </div>
          )}
        </aside>

        <section className="min-w-0 space-y-2" aria-label="Prévia do site">
          <div className="flex items-center gap-2">
            <p className="text-sm text-muted">Prévia: <span className="font-medium text-zinc-100">{PAGE_LABELS[page]}</span>{dirty && " · alterações não salvas"}</p>
            <span className="flex-1" />
            <div className="inline-flex gap-0.5 rounded-lg border border-line bg-panel p-0.5"><button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} className={`rounded-md p-1.5 ${device === "desktop" ? "bg-panel2 text-white" : "text-muted"}`} aria-label="Computador"><Monitor className="h-4 w-4" /></button><button type="button" aria-pressed={device === "phone"} onClick={() => setDevice("phone")} className={`rounded-md p-1.5 ${device === "phone" ? "bg-panel2 text-white" : "text-muted"}`} aria-label="Celular"><Smartphone className="h-4 w-4" /></button></div>
          </div>
          <Preview theme={t} content={content} page={page} packages={packages} device={device} onNav={(p) => setTab(p)} height={760} requestHref={requestHref} />
        </section>
      </div>
    </div>
  );
}
