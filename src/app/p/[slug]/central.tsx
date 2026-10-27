"use client";
import { useEffect, useRef, useState } from "react";
import { Plane, Wallet, MessageCircle, ChevronRight, ExternalLink, AtSign, Mail } from "lucide-react";
import { Field, Alert } from "@/components/ui";
import { ProgramLogo } from "@/components/program-logo";
import { themeForBg, bannerUrl, type PageDesign, type PageButton } from "@/domain/page-design";
import { PublicOrderForm } from "./order-form";

export type CentralView = "home" | "captacao" | "gestao";
export type CentralData = {
  slug: string;
  displayName: string;
  headline: string | null;
  bio: string | null;
  whatsapp: string | null;
  instagram: string | null;
  email: string | null;
  acceptsOrders: boolean;
  acceptsLeads: boolean;
  programs: { id: string; name: string; color: string }[];
  design: PageDesign;
  bannerVersion: string | null;
};

/**
 * Central de Atendimento inteira. A mesma tela serve a página pública e a prévia do editor
 * (preview: os formulários não enviam nada, só mostram a mensagem de confirmação).
 */
export function CentralPage({ data, brand, appName, view = "home", preview = false, bannerSrc }: { data: CentralData; brand: string; appName: string; view?: CentralView; preview?: boolean; bannerSrc?: string | null }) {
  return (
    <PageShell brand={brand} appName={appName} bgColor={data.design.bgColor} banner={bannerUrl(data.slug, data.bannerVersion, bannerSrc)}>
        <p className="kicker">Central de Atendimento</p>
        <h1 className="mt-1 text-3xl font-semibold">{data.displayName}</h1>
        <p className="mt-2 text-lg text-muted">{data.headline || "Sua viagem começa aqui"}</p>
        {data.bio && <p className="mt-4 whitespace-pre-line text-sm text-muted">{data.bio}</p>}
        {data.programs.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Programas">
            {data.programs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm">
                <ProgramLogo programId={pr.id} name={pr.name} color={pr.color} size={18} />
                {pr.name}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-8">
          <CentralActions data={data} view={view} preview={preview} />
        </div>
        {(data.instagram || data.email) && (
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {data.instagram && <a className="btn-ghost h-9" href={`https://instagram.com/${data.instagram}`} target="_blank" rel="noopener noreferrer"><AtSign className="h-4 w-4" />{data.instagram}</a>}
            {data.email && <a className="btn-ghost h-9" href={`mailto:${data.email}`}><Mail className="h-4 w-4" />E-mail</a>}
          </div>
        )}
    </PageShell>
  );
}

/** Moldura comum das páginas do cliente: cor de fundo, marca, banner e rodapé. */
export function PageShell({ brand, appName, bgColor, banner, children }: { brand: string; appName: string; bgColor: string | null; banner: string | null; children: React.ReactNode }) {
  return (
    <div data-theme={themeForBg(bgColor)} className="min-h-screen bg-bg text-zinc-100" style={bgColor ? { backgroundColor: bgColor } : undefined}>
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-xl items-center px-4 py-3">
          <span className="text-lg font-bold tracking-tight">{brand}</span>
        </div>
      </header>
      {banner && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" className="mx-auto block aspect-[3/1] w-full max-w-xl object-cover sm:mt-4 sm:rounded-2xl" />
      )}
      <main className="mx-auto max-w-xl px-4 py-10">
        {children}
        <p className="mt-10 text-center text-xs text-muted">{brand} · página criada com o {appName}</p>
      </main>
    </div>
  );
}

const ICONS = {
  cotacao: { Icon: Plane, tone: "bg-blue-500/15 text-blue-300" },
  gestao: { Icon: Wallet, tone: "bg-amber-500/15 text-amber-300" },
  whatsapp: { Icon: MessageCircle, tone: "bg-green-500/15 text-green-300" },
  link: { Icon: ExternalLink, tone: "bg-violet-500/15 text-violet-300" },
} as const;

/** Botões da Central na ordem escolhida pelo dono; cada botão fixo só aparece se estiver ligado. */
function CentralActions({ data, view, preview }: { data: CentralData; view: CentralView; preview: boolean }) {
  const [open, setOpen] = useState<CentralView>(view);
  const opened = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setOpen(view);
  }, [view]);
  // Na prévia do editor, a aba do formulário rola até ele
  useEffect(() => {
    if (preview && open !== "home" && open === view) opened.current?.scrollIntoView({ block: "start" });
  }, [preview, view, open]);
  const wa = data.whatsapp ? `https://wa.me/${data.whatsapp.length <= 11 ? `55${data.whatsapp}` : data.whatsapp}` : null;
  const card = "flex w-full items-center gap-4 rounded-2xl border border-line bg-panel p-4 text-left transition-colors hover:border-accent-light";
  const visible = (b: PageButton) => (b.kind === "cotacao" ? data.acceptsOrders : b.kind === "gestao" ? data.acceptsLeads : b.kind === "whatsapp" ? !!wa : true);
  const body = (b: PageButton, chevron: React.ReactNode) => {
    const { Icon, tone } = ICONS[b.kind];
    return (
      <>
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}><Icon className="h-5 w-5" /></span>
        <span className="min-w-0 flex-1"><span className="block font-semibold">{b.label}</span>{b.description && <span className="block text-sm text-muted">{b.description}</span>}</span>
        {chevron}
      </>
    );
  };
  return (
    <div className="space-y-3">
      {data.design.buttons.filter(visible).map((b, i) => {
        if (b.kind === "cotacao" || b.kind === "gestao") {
          const s = data.design[b.kind === "cotacao" ? "captacao" : "gestao"];
          const isOpen = open === (b.kind === "cotacao" ? "captacao" : "gestao");
          return (
            <div key={b.kind}>
              <button type="button" className={card} onClick={() => setOpen(isOpen ? "home" : b.kind === "cotacao" ? "captacao" : "gestao")} aria-expanded={isOpen}>
                {body(b, <ChevronRight className={`h-5 w-5 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} />)}
              </button>
              {isOpen && (
                <div ref={opened} className="card card-pad mt-2 scroll-mt-4">
                  <h2 className="font-semibold">{s.title}</h2>
                  {s.text && <p className="mb-4 mt-1 whitespace-pre-line text-sm text-muted">{s.text}</p>}
                  {b.kind === "cotacao" ? <PublicOrderForm slug={data.slug} submit={s.submit} thanks={s.thanks} preview={preview} /> : <LeadForm slug={data.slug} submit={s.submit} thanks={s.thanks} preview={preview} />}
                </div>
              )}
            </div>
          );
        }
        const href = b.kind === "whatsapp" ? wa! : b.url!;
        return (
          <a key={`${b.kind}-${i}`} href={href} target="_blank" rel="noopener noreferrer" className={card}>
            {body(b, <ChevronRight className="h-5 w-5 text-muted" />)}
          </a>
        );
      })}
    </div>
  );
}

function LeadForm({ slug, submit, thanks, preview }: { slug: string; submit: string; thanks: string; preview: boolean }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [erro, setErro] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (preview) return setDone(true);
    if (!phone.trim() && !email.trim()) return setErro("Informe um WhatsApp ou e-mail para contato");
    setBusy(true);
    const r = await fetch(`/api/public/leads/${encodeURIComponent(slug)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, phone: phone || null, email: email || null, message: message || null, website }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) return setErro(j.erro ?? "Não foi possível enviar. Tente de novo.");
    setDone(true);
  }
  if (done) return <Alert kind="ok">{thanks}</Alert>;
  return (
    <form onSubmit={send} noValidate={preview} className="space-y-3" aria-label="Interesse em gestão de milhas">
      {erro && <Alert>{erro}</Alert>}
      <Field label="Seu nome" required><input className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} autoComplete="name" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="WhatsApp"><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" maxLength={30} autoComplete="tel" /></Field>
        <Field label="E-mail"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} autoComplete="email" /></Field>
      </div>
      <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} className="absolute -left-[9999px] h-0 w-0 opacity-0" aria-hidden />
      <Field label="Conte um pouco (opcional)"><textarea className="input min-h-20" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} placeholder="Quais cartões e programas você usa, objetivos de viagem…" /></Field>
      <button className="btn-primary w-full" disabled={busy}>{busy ? "Enviando…" : submit}</button>
    </form>
  );
}
