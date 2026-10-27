"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Copy, ExternalLink, FileSignature, FileText, BadgeCheck, BarChart3, ImagePlus, Link2, MessageCircle, Monitor, Plane, Plus, Send, Smartphone, Star, Tablet, Trash2, User, Wallet } from "lucide-react";
import { refreshSafe } from "@/lib/nav";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Field, Alert } from "@/components/ui";
import { Switch } from "@/components/form-parts";
import { toast, confirmDialog } from "@/components/feedback";
import { BG_PRESETS, DEFAULT_DESIGN, DESIGN_PAGES, MAX_LINK_BUTTONS, resolveDesign, type DesignPage, type PageButton, type PageDesign } from "@/domain/page-design";
import type { PreviewMessage } from "@/app/preview/central/client";

export type EditorProfile = {
  slug: string; displayName: string; bio: string | null; whatsapp: string | null; instagram: string | null; email: string | null;
  programIds: string[]; published: boolean; acceptsOrders: boolean; acceptsLeads: boolean; headline: string | null;
  design: unknown; bannerUpdatedAt: string | Date | null;
} | null;
type Signature = { id: string; name: string; email: string | null; phone: string | null; createdAt: string | Date };

const PAGE_ICONS: Record<DesignPage, typeof User> = { home: User, captacao: Send, gestao: Star, cotacao: FileText, reserva: BadgeCheck, gestaoMilhas: BarChart3, contrato: FileSignature };
const DEVICES = [
  { key: "desktop", label: "Computador", width: 1280, Icon: Monitor },
  { key: "tablet", label: "Tablet", width: 768, Icon: Tablet },
  { key: "phone", label: "Celular", width: 390, Icon: Smartphone },
] as const;
const PREVIEW_HEIGHT = 680;
const BUTTON_ICONS = { cotacao: Plane, gestao: Wallet, whatsapp: MessageCircle, link: Link2 } as const;
// Onde cada página é usada (mostrado no topo da aba)
const PAGE_HELP: Partial<Record<DesignPage, string>> = {
  captacao: "O formulário “Pedir cotação” da página principal. Cada envio vira um pedido em CRM › Novos pedidos.",
  gestao: "O formulário “Interesse em gestão de milhas” da página principal. Os contatos aparecem em CRM › Lista.",
  cotacao: "Página que o cliente abre pelo link da cotação. No CRM, abra o pedido e use “Copiar link da cotação”.",
  reserva: "Página que o cliente abre depois da emissão, com localizador e documentos. No CRM, abra o pedido e use “Copiar link da reserva”.",
  gestaoMilhas: "Página de saldos que o titular abre pelo acesso enviado em Titulares › Enviar acesso.",
  contrato: "Página onde o cliente da gestão de milhas lê os termos e assina. Envie o link abaixo.",
};

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function Pro() {
  return <span className="ml-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-bold text-zinc-950">PRO</span>;
}

/** Seção recolhível do painel da direita, como na simbora.la. */
function Panel({ title, pro, locked = false, open, aside, children }: { title: string; pro?: boolean; locked?: boolean; open?: boolean; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <details className="group card overflow-hidden" open={open}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span className="flex flex-1 items-center">{title}{pro && <Pro />}{aside}</span>
        <ChevronRight className="h-4 w-4 text-muted transition-transform group-open:rotate-90" />
      </summary>
      <div className="border-t border-line px-5 py-4">
        {pro && locked ? (
          <div className="space-y-3">
            <p className="text-sm text-muted">Disponível a partir do plano PRO. <Link href="/app/upgrade" className="text-accent-light hover:underline">Ver planos</Link></p>
            <div className="pointer-events-none opacity-50" aria-hidden>{children}</div>
          </div>
        ) : children}
      </div>
    </details>
  );
}

export function PageEditor({ profile, defaultName, programs, brand, appName, canBrand, planNote, signatures }: { profile: EditorProfile; defaultName: string; programs: { id: string; name: string }[]; brand: string; appName: string; canBrand: boolean; planNote: string | null; signatures: Signature[] }) {
  const router = useRouter();
  const initial = useMemo(() => ({
    slug: profile?.slug ?? slugify(defaultName),
    displayName: profile?.displayName ?? defaultName,
    bio: profile?.bio ?? "",
    whatsapp: profile?.whatsapp ?? "",
    instagram: profile?.instagram ?? "",
    email: profile?.email ?? "",
    programIds: profile?.programIds ?? [],
    published: profile?.published ?? false,
    acceptsOrders: profile?.acceptsOrders ?? true,
    acceptsLeads: profile?.acceptsLeads ?? true,
    headline: profile?.headline ?? "",
    design: resolveDesign(profile?.design),
  }), [profile, defaultName]);
  const [f, setF] = useState(initial);
  useEffect(() => {
    setF(initial);
  }, [initial]);
  const [page, setPage] = useState<DesignPage>("home");
  const [device, setDevice] = useState<(typeof DEVICES)[number]["key"]>("phone");
  const [bannerVersion, setBannerVersion] = useState(profile?.bannerUpdatedAt ? String(new Date(profile.bannerUpdatedAt).getTime()) : null);
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const dirty = JSON.stringify(f) !== JSON.stringify(initial);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const setD = (patch: Partial<PageDesign>) => setF((x) => ({ ...x, design: { ...x.design, ...patch } }));
  const setSect = <K extends "captacao" | "gestao" | "cotacao" | "reserva" | "gestaoMilhas" | "contrato">(k: K, field: keyof PageDesign[K], v: string) =>
    setF((x) => ({ ...x, design: { ...x.design, [k]: { ...x.design[k], [field]: v } } }));
  const savedSlug = profile?.slug ?? null;
  const bannerSrc = bannerVersion && savedSlug ? `/api/public/banner/${encodeURIComponent(savedSlug)}?v=${bannerVersion}` : null;

  // Avisa antes de sair com alterações não salvas
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ---------- prévia ao vivo (iframe na largura real do aparelho) ----------
  const frame = useRef<HTMLIFrameElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [boxWidth, setBoxWidth] = useState(390);
  // Conta as cargas do iframe; o rascunho vai ao montar, a cada mudança e a cada carga/“pronto”
  // (qualquer um dos dois lados pode terminar de carregar primeiro)
  const [ready, setReady] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBoxWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => { if (e.origin === window.location.origin && e.data?.type === "central-preview-ready") setReady((n) => n + 1); };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);
  useEffect(() => {
    const msg: PreviewMessage = {
      type: "central-preview",
      view: page,
      bannerSrc: canBrand ? bannerSrc : null,
      draft: { slug: f.slug, displayName: f.displayName || defaultName, headline: f.headline || null, bio: f.bio || null, whatsapp: f.whatsapp.replace(/\D/g, "") || null, instagram: f.instagram.replace(/^@/, "") || null, email: f.email || null, acceptsOrders: f.acceptsOrders, acceptsLeads: f.acceptsLeads, programIds: f.programIds, design: canBrand ? f.design : { ...f.design, bgColor: null } },
    };
    frame.current?.contentWindow?.postMessage(msg, window.location.origin);
  }, [f, page, ready, bannerSrc, canBrand, defaultName]);
  const dev = DEVICES.find((d) => d.key === device)!;
  const scale = Math.min(1, boxWidth / dev.width);

  async function save() {
    setBusy(true);
    const r = await api("/api/sales-profile", "PUT", f);
    setBusy(false);
    if (!r.ok) return setErro(r.erro);
    setErro("");
    toast("Página salva");
    refreshSafe(router);
  }

  async function uploadBanner(file: File) {
    const r = await fetch("/api/sales-profile/banner", { method: "PUT", body: file, headers: { "content-type": file.type || "application/octet-stream" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return toast(j.erro ?? "Não foi possível enviar o banner", "error");
    setBannerVersion(String(Date.now()));
    toast("Banner atualizado");
  }
  async function removeBanner() {
    if (!(await confirmDialog({ title: "Remover o banner?", confirmLabel: "Remover", danger: true }))) return;
    const r = await api("/api/sales-profile/banner", "DELETE");
    if (!r.ok) return toast(r.erro, "error");
    setBannerVersion(null);
  }

  const pageLink = `${origin}/p/${savedSlug ?? f.slug}${page === "contrato" ? "/contrato" : ""}`;
  async function copy(text: string) {
    await navigator.clipboard.writeText(text).catch(() => null);
    toast("Link copiado");
  }

  // ---------- botões ----------
  const buttons = f.design.buttons;
  const setButtons = (b: PageButton[]) => setD({ buttons: b });
  const move = (i: number, dir: -1 | 1) => {
    const b = [...buttons];
    [b[i], b[i + dir]] = [b[i + dir], b[i]];
    setButtons(b);
  };
  const patchButton = (i: number, p: Partial<PageButton>) => setButtons(buttons.map((b, j) => (j === i ? { ...b, ...p } : b)));
  const links = buttons.filter((b) => b.kind === "link").length;

  const bgPanel = (
    <Panel title="Cor de Fundo" pro locked={!canBrand} aside={<span className="ml-3 h-5 w-16 rounded border border-line" style={{ backgroundColor: f.design.bgColor ?? "rgb(var(--bg))" }} aria-hidden />}>
      <p className="mb-3 text-xs text-muted">Vale para todas as páginas.</p>
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Cor de fundo">
        <button type="button" onClick={() => setD({ bgColor: null })} aria-pressed={f.design.bgColor === null} className={`h-8 rounded-lg border px-2 text-xs ${f.design.bgColor === null ? "border-accent-light text-white" : "border-line text-muted"}`}>Padrão</button>
        {BG_PRESETS.map((c) => (
          <button key={c} type="button" onClick={() => setD({ bgColor: c })} aria-pressed={f.design.bgColor === c} aria-label={`Cor ${c}`} style={{ backgroundColor: c }} className={`h-8 w-8 rounded-full border-2 ${f.design.bgColor === c ? "border-accent-light" : "border-line"}`} />
        ))}
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="color" value={f.design.bgColor ?? "#09090b"} onChange={(e) => setD({ bgColor: e.target.value })} className="h-8 w-10 cursor-pointer rounded border border-line bg-transparent" aria-label="Escolher outra cor" />
          Outra cor
        </label>
      </div>
    </Panel>
  );

  const textPanel = (k: "captacao" | "gestao" | "cotacao" | "reserva" | "gestaoMilhas" | "contrato", fields: [string, string, "input" | "textarea", number][]) => (
    <Panel title="Introdução" open>
      <div className="space-y-4">
        {fields.map(([field, label, kind, max]) => {
          const v = (f.design[k] as Record<string, string>)[field] ?? "";
          const ph = (DEFAULT_DESIGN[k] as Record<string, string>)[field];
          return (
            <Field key={field} label={label}>
              {kind === "input"
                ? <input className="input" value={v} onChange={(e) => setSect(k, field as never, e.target.value)} maxLength={max} placeholder={ph} />
                : <textarea className={`input ${max > 1000 ? "min-h-56" : "min-h-20"}`} value={v} onChange={(e) => setSect(k, field as never, e.target.value)} maxLength={max} placeholder={ph} />}
            </Field>
          );
        })}
      </div>
    </Panel>
  );

  return (
    <main className="min-h-screen pb-24">
      <div className="mx-auto max-w-7xl px-4 pt-4">
        <Link href="/app/settings?tab=sales-profile" className="btn-ghost h-9 rounded-full"><ArrowLeft className="h-4 w-4" />Voltar para o {appName}</Link>
        <h1 className="mt-4 text-center text-lg font-semibold">{f.displayName || defaultName}</h1>

        <nav className="mt-6 flex items-center gap-2 overflow-x-auto pb-2" role="tablist" aria-label="Personalizar">
          <span className="shrink-0 text-sm font-medium text-muted">Personalizar:</span>
          {DESIGN_PAGES.map((p) => {
            const Icon = PAGE_ICONS[p.key];
            const on = page === p.key;
            return (
              <button key={p.key} type="button" role="tab" aria-selected={on} onClick={() => setPage(p.key)} className={`flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${on ? "border-transparent bg-zinc-100 text-zinc-950" : "border-line text-muted hover:text-zinc-100"}`}>
                <Icon className="h-4 w-4" />{p.label}
              </button>
            );
          })}
        </nav>

        {planNote && <div className="mt-3 rounded-xl border border-green-900/60 bg-green-950/30 px-4 py-3 text-sm text-green-200">{planNote} <Link href="/app/upgrade" className="font-semibold underline">Ver planos</Link></div>}
        {!profile?.published && <div className="mt-3 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">Sua página ainda não está no ar. Ative em <Link href="/app/settings?tab=sales-profile" className="font-semibold underline">Configurações › Sua {brand}</Link>.</div>}
        {erro && <div className="mt-3"><Alert>{erro}</Alert></div>}

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <section aria-label="Prévia" className="min-w-0 lg:sticky lg:top-4 lg:self-start">
            <div className="mb-3 flex items-center gap-3">
              <p className="kicker">Prévia · {DESIGN_PAGES.find((p) => p.key === page)!.label}</p>
              <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">{dev.label} ({dev.width}px)</span>
              <div className="ml-auto inline-flex gap-1 rounded-xl border border-line bg-panel p-1" role="group" aria-label="Tamanho da prévia">
                {DEVICES.map((d) => (
                  <button key={d.key} type="button" aria-pressed={device === d.key} title={`${d.label} (${d.width}px)`} aria-label={d.label} onClick={() => setDevice(d.key)} className={`flex h-8 w-9 items-center justify-center rounded-lg ${device === d.key ? "bg-zinc-100 text-zinc-950" : "text-muted hover:text-zinc-100"}`}><d.Icon className="h-4 w-4" /></button>
                ))}
              </div>
            </div>
            <div ref={box}>
              <div className="mx-auto overflow-hidden rounded-2xl border border-line bg-panel shadow-xl" style={{ width: dev.width * scale }}>
                <div className="flex items-center gap-2 border-b border-line bg-panel2 px-3 py-2">
                  <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2.5 w-2.5 rounded-full bg-zinc-600" />)}</span>
                  <span className="min-w-0 truncate rounded-full bg-panel px-3 py-0.5 text-xs text-muted">{pageLink.replace(/^https?:\/\//, "") || "…"}</span>
                </div>
                <div style={{ height: PREVIEW_HEIGHT }}>
                  <iframe
                    ref={frame}
                    src="/preview/central"
                    title="Prévia da sua página"
                    onLoad={() => setReady((n) => n + 1)}
                    style={{ width: dev.width, height: PREVIEW_HEIGHT / scale, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="min-w-0 space-y-3">
            <section className="card card-pad" aria-label="Link da sua página">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-green-400" />
                <h2 className="flex-1 font-semibold">{page === "contrato" ? "Link do contrato" : "Link da sua página (Bio)"}</h2>
                {profile?.published && <a href={pageLink} target="_blank" rel="noopener" className="btn-ghost h-8 text-xs">Abrir<ExternalLink className="h-3.5 w-3.5" /></a>}
              </div>
              <p className="mb-3 mt-1 text-xs text-muted">Compartilhe este link com seus clientes.</p>
              <div className="flex gap-2">
                <input className="input min-w-0 flex-1 text-sm" readOnly value={pageLink} aria-label="Link da sua página" onFocus={(e) => e.target.select()} />
                <button type="button" className="btn-ghost h-10 w-10 p-0" onClick={() => copy(pageLink)} aria-label="Copiar link"><Copy className="h-4 w-4" /></button>
              </div>
            </section>

            {PAGE_HELP[page] && <p className="px-1 text-sm text-muted">{PAGE_HELP[page]}</p>}

            {bgPanel}

            {page === "home" && (
              <>
                <Panel title="Introdução">
                  <div className="space-y-4">
                    <Field label="Nome de exibição" required><input className="input" value={f.displayName} onChange={(e) => set("displayName", e.target.value)} required minLength={2} maxLength={80} /></Field>
                    <Field label="Frase de abertura" hint="Aparece abaixo do seu nome. Padrão: “Sua viagem começa aqui”"><input className="input" value={f.headline} onChange={(e) => set("headline", e.target.value)} maxLength={120} placeholder="Sua viagem começa aqui" /></Field>
                    <Field label="Sobre você" hint="Até 500 caracteres"><textarea className="input min-h-24" value={f.bio} onChange={(e) => set("bio", e.target.value)} maxLength={500} placeholder="Ex.: Emito passagens com milhas há 5 anos, atendimento pelo WhatsApp." /></Field>
                    <Field label="Programas com que você trabalha">
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Programas com que você trabalha">
                        {programs.map((p) => {
                          const on = f.programIds.includes(p.id);
                          return (
                            <button key={p.id} type="button" aria-pressed={on} onClick={() => set("programIds", on ? f.programIds.filter((x) => x !== p.id) : [...f.programIds, p.id])} className={`rounded-full border px-3 py-1 text-xs font-medium ${on ? "border-accent-light bg-accent-soft text-white" : "border-line text-muted hover:text-zinc-100"}`}>
                              {p.name}
                            </button>
                          );
                        })}
                      </div>
                    </Field>
                  </div>
                </Panel>

                <Panel title="Banner no topo" pro locked={!canBrand}>
                  {!savedSlug ? <p className="text-sm text-muted">Salve a página uma vez para enviar o banner.</p> : (
                    <div className="space-y-3">
                      {bannerSrc ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bannerSrc} alt="Banner atual" className="aspect-[3/1] w-full rounded-xl object-cover" />
                      ) : <p className="text-sm text-muted">Imagem larga (proporção 3:1, ex.: 1200×400), JPG, PNG ou WebP até 1 MB.</p>}
                      <div className="flex gap-2">
                        <label className="btn-ghost h-9 cursor-pointer"><ImagePlus className="h-4 w-4" />{bannerSrc ? "Trocar imagem" : "Enviar imagem"}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" aria-label="Imagem do banner" onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) uploadBanner(file); }} />
                        </label>
                        {bannerSrc && <button type="button" className="btn-ghost h-9" onClick={removeBanner}><Trash2 className="h-4 w-4" />Remover</button>}
                      </div>
                    </div>
                  )}
                </Panel>

                <Panel title="Botões">
                  <p className="mb-3 text-sm text-muted">Mude o texto, a ordem e quais aparecem. Também dá para adicionar links seus (site, catálogo, grupo).</p>
                  <ul className="space-y-3">
                    {buttons.map((b, i) => {
                      const Icon = BUTTON_ICONS[b.kind];
                      const kindName = b.kind === "cotacao" ? "Pedir cotação" : b.kind === "gestao" ? "Gestão de milhas" : b.kind === "whatsapp" ? "WhatsApp" : `Link ${buttons.slice(0, i + 1).filter((x) => x.kind === "link").length}`;
                      return (
                        <li key={`${b.kind}-${i}`} className="rounded-xl border border-line p-3" aria-label={`Botão ${kindName}`}>
                          <div className="mb-2 flex items-center gap-2">
                            <Icon className="h-4 w-4 text-muted" />
                            <span className="flex-1 text-xs font-semibold uppercase tracking-wider text-muted">{kindName}</span>
                            <button type="button" className="btn-ghost h-7 w-7 p-0" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Subir"><ArrowUp className="h-3.5 w-3.5" /></button>
                            <button type="button" className="btn-ghost h-7 w-7 p-0" disabled={i === buttons.length - 1} onClick={() => move(i, 1)} aria-label="Descer"><ArrowDown className="h-3.5 w-3.5" /></button>
                            {b.kind === "link" && <button type="button" className="btn-ghost h-7 w-7 p-0" onClick={() => setButtons(buttons.filter((_, j) => j !== i))} aria-label="Remover link"><Trash2 className="h-3.5 w-3.5" /></button>}
                          </div>
                          {b.kind === "cotacao" && <div className="mb-3"><Switch label="Mostrar “Pedir cotação”" checked={f.acceptsOrders} onChange={(v) => set("acceptsOrders", v)} /></div>}
                          {b.kind === "gestao" && <div className="mb-3"><Switch label="Mostrar “Interesse em gestão de milhas”" checked={f.acceptsLeads} onChange={(v) => set("acceptsLeads", v)} /></div>}
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field label="Texto do botão"><input className="input" value={b.label} onChange={(e) => patchButton(i, { label: e.target.value })} maxLength={60} /></Field>
                            <Field label="Descrição"><input className="input" value={b.description} onChange={(e) => patchButton(i, { description: e.target.value })} maxLength={120} /></Field>
                            {b.kind === "whatsapp" && <Field label="WhatsApp" hint="Vazio, o botão não aparece" className="sm:col-span-2"><input className="input" value={f.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} inputMode="tel" placeholder="(11) 90000-0000" maxLength={20} /></Field>}
                            {b.kind === "link" && <Field label="Endereço (https://…)" className="sm:col-span-2"><input className="input" type="url" value={b.url ?? ""} onChange={(e) => patchButton(i, { url: e.target.value })} maxLength={300} placeholder="https://" /></Field>}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {links < MAX_LINK_BUTTONS && <button type="button" className="btn-ghost mt-3 h-9" onClick={() => setButtons([...buttons, { kind: "link", label: "", description: "", url: "" }])}><Plus className="h-4 w-4" />Adicionar link</button>}
                </Panel>

                <Panel title="Outros contatos">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Instagram"><input className="input" value={f.instagram} onChange={(e) => set("instagram", e.target.value)} placeholder="@seuperfil" maxLength={31} /></Field>
                    <Field label="E-mail de contato"><input className="input" type="email" value={f.email} onChange={(e) => set("email", e.target.value)} maxLength={200} /></Field>
                  </div>
                </Panel>

                <Panel title="Prévia do link ao compartilhar" pro locked={!canBrand}>
                  <div className="space-y-4">
                    <Field label="Título" hint="Vazio: seu nome · Central de Atendimento"><input className="input" value={f.design.share.title} onChange={(e) => setD({ share: { ...f.design.share, title: e.target.value } })} maxLength={80} placeholder={`${f.displayName} · Central de Atendimento`} /></Field>
                    <Field label="Descrição" hint="Vazio: usa a frase que aparece abaixo do seu nome"><textarea className="input min-h-16" value={f.design.share.description} onChange={(e) => setD({ share: { ...f.design.share, description: e.target.value } })} maxLength={200} placeholder={f.headline || "Sua viagem começa aqui"} /></Field>
                    <div className="overflow-hidden rounded-xl border border-line bg-panel2" aria-label="Como aparece no WhatsApp">
                      {bannerSrc && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bannerSrc} alt="" className="aspect-[1.91/1] w-full object-cover" />
                      )}
                      <div className="p-3">
                        <p className="truncate text-sm font-semibold">{f.design.share.title || `${f.displayName} · Central de Atendimento — ${brand}`}</p>
                        <p className="line-clamp-2 text-xs text-muted">{f.design.share.description || f.headline || "Sua viagem começa aqui"}</p>
                        <p className="mt-1 truncate text-[11px] text-muted">{origin.replace(/^https?:\/\//, "")}</p>
                      </div>
                    </div>
                  </div>
                </Panel>
              </>
            )}

            {(page === "captacao" || page === "gestao") && (
              <>
                <Panel title="Ativação" open>
                  <Switch
                    label={page === "captacao" ? "Receber pedidos de cotação" : "Receber interessados em gestão de milhas"}
                    checked={page === "captacao" ? f.acceptsOrders : f.acceptsLeads}
                    onChange={(v) => set(page === "captacao" ? "acceptsOrders" : "acceptsLeads", v)}
                  />
                </Panel>
                {textPanel(page, [["title", "Título do formulário", "input", 80], ["text", "Texto de apresentação", "textarea", 300], ["submit", "Texto do botão de envio", "input", 40]])}
                <Panel title="Mensagem de confirmação" open>
                  <Field label="Depois de enviar, o cliente vê" hint="Na prévia, clique no botão de envio para ver a mensagem"><textarea className="input min-h-16" value={f.design[page].thanks} onChange={(e) => setSect(page, "thanks", e.target.value)} maxLength={200} placeholder={DEFAULT_DESIGN[page].thanks} /></Field>
                </Panel>
              </>
            )}
            {page === "cotacao" && textPanel("cotacao", [["title", "Título", "input", 80], ["text", "Texto de apresentação", "textarea", 300], ["cta", "Botão de aprovação (WhatsApp)", "input", 40], ["footer", "Observação no rodapé", "textarea", 200]])}
            {page === "reserva" && textPanel("reserva", [["title", "Título", "input", 80], ["text", "Texto de apresentação", "textarea", 300], ["tips", "Dicas para a viagem", "textarea", 500]])}
            {page === "gestaoMilhas" && textPanel("gestaoMilhas", [["title", "Título", "input", 80], ["text", "Texto de apresentação", "textarea", 300]])}
            {page === "contrato" && (
              <>
                {textPanel("contrato", [["title", "Título", "input", 80], ["text", "Texto de apresentação", "textarea", 300], ["terms", "Termos do contrato", "textarea", 5000], ["submit", "Texto do botão de assinatura", "input", 40], ["thanks", "Mensagem depois de assinar", "textarea", 200]])}
                <Panel title="Assinaturas recebidas" aside={<span className="ml-2 text-sm font-normal text-muted">{signatures.length}</span>}>
                  {signatures.length === 0 ? <p className="text-sm text-muted">Ninguém assinou ainda.</p> : (
                    <ul className="divide-y divide-line text-sm" aria-label="Assinaturas">
                      {signatures.map((s) => <li key={s.id} className="flex justify-between gap-3 py-2"><span className="min-w-0 truncate">{s.name}<span className="text-muted">{[s.phone, s.email].filter(Boolean).length ? ` · ${[s.phone, s.email].filter(Boolean).join(" · ")}` : ""}</span></span><span className="shrink-0 text-muted">{fmtDate(s.createdAt)}</span></li>)}
                    </ul>
                  )}
                </Panel>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 py-3">
          {dirty ? <span className="text-xs text-amber-300">Alterações não salvas</span> : <span className="text-xs text-muted">Tudo salvo</span>}
          <button type="button" className="btn-primary" disabled={busy || (!dirty && !!profile)} onClick={save}>{busy ? "Salvando…" : "Salvar alterações"}</button>
        </div>
      </div>
    </main>
  );
}
