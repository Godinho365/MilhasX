// Desenho do site da agência: o mesmo componente para os 5 temas e as 4 páginas. Cada seção lê as
// cores, a tipografia e os formatos do tema (domain/site-themes.ts). Sem hooks: serve tanto para a
// página pública (servidor) quanto para a prévia ao vivo do editor (cliente).
// Cores só por estilo inline/variáveis próprias: as classes de cor do app mudam com o tema claro/escuro.
import { PAGE_LABELS, SITE_PAGES, siteWhatsapp, type Section, type SiteContent, type SitePage } from "@/domain/site";
import type { SiteTheme } from "@/domain/site-themes";
import { btnStyle, cardStyle, headingStyle, wrap } from "./site-style";
import { CheckBadgeIcon, WhatsappIcon, socialLinks } from "./site-icons";
import { SiteMilesForm, SiteQuoteForm } from "./site-forms";

export type SitePackage = { id: string; title: string; destination: string; period: string | null; includes: string[]; description: string | null; priceCents: number | null; priceNote: string | null; installments: string | null; imageVersion: string | null };
export type SiteCtx = {
  theme: SiteTheme; content: SiteContent; page: SitePage; packages: SitePackage[];
  href: (p: SitePage) => string; img: (id: string) => string; pkgImg: (p: SitePackage) => string | null;
  requestHref: string | null; onNav?: (p: SitePage) => void;
  /** endereço da agência (formulários); null na galeria de temas */
  slug: string | null;
  /** dentro do editor ou da galeria: formulários não enviam e o que é fixo na tela fica preso à prévia */
  embedded?: boolean;
};

const money = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0, maximumFractionDigits: 2 });

function vars(t: SiteTheme, accent: string | null): React.CSSProperties {
  const c = t.colors;
  return {
    ["--s-bg" as string]: c.bg, ["--s-surface" as string]: c.surface, ["--s-text" as string]: c.text, ["--s-muted" as string]: c.muted,
    ["--s-accent" as string]: accent ?? c.accent, ["--s-on-accent" as string]: c.onAccent, ["--s-line" as string]: c.line,
    ["--s-band" as string]: c.band, ["--s-on-band" as string]: c.onBand,
    backgroundColor: c.bg, color: c.text, fontFamily: t.body,
  };
}

function Photo({ ctx, id, className, style, alt = "" }: { ctx: SiteCtx; id: string | null; className?: string; style?: React.CSSProperties; alt?: string }) {
  if (id) return <img src={ctx.img(id)} alt={alt} className={className} style={{ objectFit: "cover", display: "block", width: "100%", height: "100%", ...style }} />;
  return <div className={className} style={{ background: ctx.theme.placeholder, width: "100%", height: "100%", ...style }} aria-hidden />;
}

function Eyebrow({ t, children, light }: { t: SiteTheme; children: React.ReactNode; light?: boolean }) {
  return <p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase", color: light ? "rgba(255,255,255,0.85)" : "var(--s-accent)" }}>{children}</p>;
}

/** Link interno: na prévia do editor troca de página sem sair da tela. */
function PageLink({ ctx, to, style, children }: { ctx: SiteCtx; to: SitePage; style?: React.CSSProperties; children: React.ReactNode }) {
  return <a href={ctx.href(to)} style={style} onClick={ctx.onNav ? (e) => { e.preventDefault(); ctx.onNav!(to); } : undefined}>{children}</a>;
}

function whatsHref(ctx: SiteCtx, text: string) {
  return siteWhatsapp(ctx.content.brand.whatsapp, text);
}

const greeting = (ctx: SiteCtx) => `Olá${ctx.content.brand.name ? `, ${ctx.content.brand.name}` : ""}! Vim pelo site e quero planejar uma viagem.`;
const hasQuote = (ctx: SiteCtx, p: SitePage) => ctx.content.pages[p].on && ctx.content.pages[p].sections.some((x) => x.type === "cotacao" && x.on);

/** Onde está o formulário de cotação: nesta página, no Contato ou em nenhuma. */
function quoteTarget(ctx: SiteCtx): SitePage | null {
  if (hasQuote(ctx, ctx.page)) return ctx.page;
  if (hasQuote(ctx, "contato")) return "contato";
  return SITE_PAGES.find((p) => hasQuote(ctx, p)) ?? null;
}

type QuoteLink = { href: string; onClick?: (e: React.MouseEvent) => void };

/**
 * Para onde vai "Pedir cotação": o formulário do site (nesta página ou na que tiver) e, sem formulário
 * no site, a página "Pedir cotação de viagem" da Central de atendimento (com o mesmo tema do site).
 */
function quoteLink(ctx: SiteCtx): QuoteLink | null {
  const to = quoteTarget(ctx);
  if (to === ctx.page) return { href: "#cotacao" };
  if (to) return { href: `${ctx.href(to)}#cotacao`, onClick: ctx.onNav ? (e) => { e.preventDefault(); ctx.onNav!(to); } : undefined };
  // na prévia do editor o botão aparece, mas não sai da tela
  if (ctx.requestHref) return { href: ctx.requestHref, onClick: ctx.embedded ? (e) => e.preventDefault() : undefined };
  return null;
}

/** Botão de cotação; sem formulário no site nem Central recebendo pedidos, vira o botão do WhatsApp. */
function QuoteButton({ ctx, label, kind = "primary" }: { ctx: SiteCtx; label: string; kind?: "primary" | "light" | "ghost" }) {
  const l = quoteLink(ctx);
  if (!l) return <MainButton ctx={ctx} label={label} kind={kind} />;
  return <a href={l.href} onClick={l.onClick} style={btnStyle(ctx.theme, kind)}>{label}</a>;
}

/** Botões da capa: cotação (principal) e WhatsApp (secundário), com a frase de garantia embaixo. */
function HeroActions({ ctx, s, onPhoto, center }: { ctx: SiteCtx; s: Extract<Section, { type: "hero" }>; onPhoto?: boolean; center?: boolean }) {
  const wa = whatsHref(ctx, greeting(ctx));
  if (!s.button && !(s.button2 && wa)) return null;
  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: center ? "center" : undefined }}>
        {s.button && <QuoteButton ctx={ctx} label={s.button} kind={onPhoto && !center ? "light" : "primary"} />}
        {s.button2 && wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle(ctx.theme, "ghost"), color: onPhoto ? "#fff" : "inherit" }}><WhatsappIcon size={18} />{s.button2}</a>}
      </div>
      {s.note && <p style={{ margin: "14px 0 0", fontSize: 13, opacity: 0.8 }}>{s.note}</p>}
    </div>
  );
}

/** Botão principal: WhatsApp da agência; sem WhatsApp, a página de contato. */
function MainButton({ ctx, label, kind = "primary" }: { ctx: SiteCtx; label: string; kind?: "primary" | "light" | "ghost" }) {
  if (!label) return null;
  const wa = whatsHref(ctx, greeting(ctx));
  return wa ? <a href={wa} target="_blank" rel="noopener noreferrer" style={btnStyle(ctx.theme, kind)}><WhatsappIcon size={18} />{label}</a> : <PageLink ctx={ctx} to="contato" style={btnStyle(ctx.theme, kind)}>{label}</PageLink>;
}

const sectionPad = (t: SiteTheme): React.CSSProperties => ({ padding: t.hero === "editorial" ? "96px 0" : "80px 0" });

// ---------------- Capa (5 estilos) ----------------

function Hero({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "hero" }> }) {
  const t = ctx.theme;
  const home = ctx.page === "inicio";
  const big = home ? "clamp(2.4rem, 5.6vw, 4.6rem)" : "clamp(2rem, 4.4vw, 3.4rem)";
  const text = s.text && <p style={{ margin: "18px 0 0", fontSize: home ? 19 : 17, lineHeight: 1.55, maxWidth: 620, opacity: 0.9 }}>{s.text}</p>;

  if (t.hero === "cover" || t.hero === "editorial") {
    const center = t.hero === "editorial";
    return (
      <section style={{ position: "relative", minHeight: home ? "78vh" : "44vh", display: "flex", alignItems: center ? "center" : "flex-end", color: "#fff", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0 }}><Photo ctx={ctx} id={s.imageId} /></div>
        <div style={{ position: "absolute", inset: 0, background: center ? "rgba(10,8,6,0.55)" : "linear-gradient(180deg, rgba(0,0,0,0.05) 20%, rgba(0,0,0,0.6) 100%)" }} />
        <div style={{ ...wrap, position: "relative", width: "100%", padding: home ? "120px 24px 80px" : "100px 24px 56px", textAlign: center ? "center" : "left" }}>
          <div style={{ maxWidth: center ? 820 : 760, margin: center ? "0 auto" : undefined }}>
            {s.eyebrow && <Eyebrow t={t} light={!center}>{s.eyebrow}</Eyebrow>}
            <h1 style={{ ...headingStyle(t, big), marginTop: 14, color: "#fff" }}>{s.title}</h1>
            {s.text && <p style={{ margin: center ? "20px auto 0" : "18px 0 0", fontSize: home ? 19 : 17, lineHeight: 1.55, maxWidth: 620, color: "rgba(255,255,255,0.9)" }}>{s.text}</p>}
            <HeroActions ctx={ctx} s={s} onPhoto center={center} />
          </div>
        </div>
      </section>
    );
  }
  if (t.hero === "split") {
    return (
      <section style={{ ...wrap, display: "grid", gap: 40, alignItems: "center", padding: home ? "64px 24px 80px" : "48px 24px 56px" }} className="md:grid-cols-[1.05fr_0.95fr]">
        <div>
          {s.eyebrow && <Eyebrow t={t}>{s.eyebrow}</Eyebrow>}
          <h1 style={{ ...headingStyle(t, big), marginTop: 14 }}>{s.title}</h1>
          {text}
          <HeroActions ctx={ctx} s={s} />
        </div>
        <div style={{ height: home ? 520 : 360, borderRadius: t.radius, overflow: "hidden", position: "relative" }}>
          <Photo ctx={ctx} id={s.imageId} />
          {(ctx.content.brand.tagline || ctx.content.brand.name) && <span style={{ position: "absolute", left: 0, bottom: 0, backgroundColor: "var(--s-accent)", color: "var(--s-on-accent)", padding: "10px 16px", fontSize: 12, fontWeight: 800, letterSpacing: "0.12em", textTransform: "uppercase" }}>{ctx.content.brand.tagline || ctx.content.brand.name}</span>}
        </div>
      </section>
    );
  }
  if (t.hero === "framed") {
    return (
      <section style={{ ...wrap, padding: home ? "72px 24px 80px" : "56px 24px 48px", textAlign: "center" }}>
        {s.eyebrow && <Eyebrow t={t}>{s.eyebrow}</Eyebrow>}
        <h1 style={{ ...headingStyle(t, big), margin: "16px auto 0", maxWidth: 900 }}>{s.title}</h1>
        {s.text && <p style={{ margin: "20px auto 0", fontSize: 18, lineHeight: 1.6, maxWidth: 640, color: "var(--s-muted)" }}>{s.text}</p>}
        <HeroActions ctx={ctx} s={s} center />
        {home && (
          <figure style={{ margin: "48px auto 0", maxWidth: 980, padding: 14, backgroundColor: "var(--s-surface)", border: "1px solid var(--s-line)", boxShadow: "0 18px 40px -24px rgba(0,0,0,0.35)", transform: "rotate(-0.6deg)" }}>
            <div style={{ height: 440 }}><Photo ctx={ctx} id={s.imageId} /></div>
            <figcaption style={{ marginTop: 10, fontFamily: t.heading.family, fontStyle: "italic", color: "var(--s-muted)", fontSize: 15 }}>{ctx.content.brand.city ? `${ctx.content.brand.name} · ${ctx.content.brand.city}` : ctx.content.brand.name}</figcaption>
          </figure>
        )}
      </section>
    );
  }
  // centered (Ciranda)
  return (
    <section style={{ position: "relative", overflow: "hidden", padding: home ? "72px 0 0" : "56px 0 40px" }}>
      <div aria-hidden style={{ position: "absolute", width: 380, height: 380, borderRadius: "50%", left: -120, top: -140, background: "var(--s-accent)", opacity: 0.12 }} />
      <div aria-hidden style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", right: -80, top: 40, background: "#ffc93c", opacity: 0.22 }} />
      <div style={{ ...wrap, position: "relative", textAlign: "center" }}>
        {s.eyebrow && <span style={{ display: "inline-block", padding: "6px 14px", borderRadius: 999, backgroundColor: "var(--s-surface)", color: "var(--s-accent)", fontSize: 13, fontWeight: 700, boxShadow: "0 4px 14px -6px rgba(0,0,0,0.2)" }}>{s.eyebrow}</span>}
        <h1 style={{ ...headingStyle(t, big), margin: "18px auto 0", maxWidth: 860 }}>{s.title}</h1>
        {s.text && <p style={{ margin: "18px auto 0", fontSize: 18, lineHeight: 1.6, maxWidth: 620, color: "var(--s-muted)" }}>{s.text}</p>}
        <HeroActions ctx={ctx} s={s} center />
        {home && <div style={{ margin: "48px auto 0", height: 420, maxWidth: 1080, borderRadius: `${t.radius}px ${t.radius}px 0 0`, overflow: "hidden" }}><Photo ctx={ctx} id={s.imageId} /></div>}
      </div>
    </section>
  );
}

// ---------------- Demais seções ----------------

function Title({ t, title, sub, center }: { t: SiteTheme; title: string; sub?: string; center?: boolean }) {
  if (!title && !sub) return null;
  return (
    <div style={{ marginBottom: 40, textAlign: center ? "center" : "left", maxWidth: center ? 720 : undefined, marginLeft: center ? "auto" : undefined, marginRight: center ? "auto" : undefined }}>
      {title && <h2 style={headingStyle(t, "clamp(1.8rem, 3.4vw, 2.6rem)")}>{title}</h2>}
      {sub && <p style={{ margin: "12px 0 0", color: "var(--s-muted)", fontSize: 17, lineHeight: 1.6 }}>{sub}</p>}
    </div>
  );
}

function Seals({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "selos" }> }) {
  const b = ctx.content.brand;
  const items = [
    ...(b.cadastur ? [{ title: "Cadastur", text: `Registro ${b.cadastur} no Ministério do Turismo` }] : []),
    ...(b.cnpj ? [{ title: "Empresa registrada", text: `CNPJ ${b.cnpj}` }] : []),
    ...(b.responseTime ? [{ title: "Resposta rápida", text: b.responseTime }] : []),
    ...s.items,
  ].slice(0, 6);
  if (!items.length) return null;
  return (
    <section style={{ borderTop: "1px solid var(--s-line)", borderBottom: "1px solid var(--s-line)", backgroundColor: "var(--s-surface)" }} aria-label="Por que confiar">
      <div style={{ ...wrap, display: "grid", gap: 18, gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", padding: "22px 24px" }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
            <CheckBadgeIcon size={22} style={{ color: "var(--s-accent)", flexShrink: 0, marginTop: 1 }} />
            <span><span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{it.title}</span>{it.text && <span style={{ display: "block", fontSize: 13, color: "var(--s-muted)", marginTop: 2 }}>{it.text}</span>}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Bloco com formulário: texto e garantias à esquerda, formulário num card à direita. */
function FormBlock({ ctx, id, title, text, bullets, children }: { ctx: SiteCtx; id: string; title: string; text: string; bullets: string[]; children: React.ReactNode }) {
  const t = ctx.theme;
  return (
    <section id={id} style={{ ...sectionPad(t), scrollMarginTop: 80 }}>
      <div style={{ ...wrap, display: "grid", gap: 40, alignItems: "start" }} className="lg:grid-cols-[0.8fr_1.2fr]">
        <div>
          <h2 style={headingStyle(t, "clamp(1.8rem, 3.4vw, 2.6rem)")}>{title}</h2>
          {text && <p style={{ margin: "14px 0 0", fontSize: 17, lineHeight: 1.6, color: "var(--s-muted)" }}>{text}</p>}
          <ul style={{ listStyle: "none", padding: 0, margin: "22px 0 0", display: "grid", gap: 10 }}>
            {bullets.filter(Boolean).map((x) => <li key={x} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15 }}><CheckBadgeIcon size={18} style={{ color: "var(--s-accent)", flexShrink: 0 }} />{x}</li>)}
          </ul>
        </div>
        <div style={{ ...cardStyle(t), backgroundColor: "var(--s-surface)", padding: 28, border: t.cards === "flat" ? "1px solid var(--s-line)" : cardStyle(t).border }}>{children}</div>
      </div>
    </section>
  );
}

function Quote({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "cotacao" }> }) {
  const b = ctx.content.brand;
  const wa = whatsHref(ctx, greeting(ctx));
  return (
    <FormBlock ctx={ctx} id="cotacao" title={s.title} text={s.text} bullets={["Sem compromisso", b.responseTime || "Resposta pelo WhatsApp", "Milhas ou tarifa: o que sair melhor"]}>
      <SiteQuoteForm t={ctx.theme} slug={ctx.slug} button={s.button} whatsapp={wa} preview={!!ctx.embedded} />
    </FormBlock>
  );
}

function Miles({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "milhas" }> }) {
  const wa = whatsHref(ctx, "Olá! Quero saber mais sobre a gestão de milhas.");
  return (
    <FormBlock ctx={ctx} id="milhas" title={s.title} text={s.text} bullets={["Mais pontos com o mesmo gasto", "Emissões no momento certo", "Acompanhamento das suas contas"]}>
      <SiteMilesForm t={ctx.theme} slug={ctx.slug} button={s.button} whatsapp={wa} preview={!!ctx.embedded} />
    </FormBlock>
  );
}

function Numbers({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "numeros" }> }) {
  const t = ctx.theme;
  if (!s.items.length) return null;
  return (
    <section style={{ ...wrap, padding: "56px 24px" }}>
      <div style={{ display: "grid", gap: 24, gridTemplateColumns: `repeat(auto-fit, minmax(180px, 1fr))`, borderTop: "1px solid var(--s-line)", borderBottom: "1px solid var(--s-line)", padding: "36px 0" }}>
        {s.items.map((n, i) => (
          <div key={i} style={{ textAlign: "center" }}>
            <p style={{ ...headingStyle(t, "clamp(2.2rem, 4vw, 3.2rem)"), color: "var(--s-accent)" }}>{n.value}</p>
            <p style={{ margin: "8px 0 0", color: "var(--s-muted)", fontSize: 14, textTransform: "uppercase", letterSpacing: "0.08em" }}>{n.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Packages({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "pacotes" }> }) {
  const t = ctx.theme;
  const list = ctx.packages.slice(0, s.limit);
  return (
    <section style={sectionPad(t)}>
      <div style={wrap}>
        <Title t={t} title={s.title} sub={s.text} />
        {list.length === 0 ? (
          <p style={{ ...cardStyle(t), padding: 32, textAlign: "center", color: "var(--s-muted)" }}>Os pacotes da sua Vitrine aparecem aqui.</p>
        ) : (
          <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
            {list.map((p) => {
              const wa = whatsHref(ctx, `Olá! Tenho interesse no pacote "${p.title}"${p.period ? ` (${p.period})` : ""}.`);
              const img = ctx.pkgImg(p);
              return (
                <article key={p.id} style={{ ...cardStyle(t), overflow: "hidden", display: "flex", flexDirection: "column" }}>
                  <div style={{ position: "relative", height: 210 }}>
                    {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : <div style={{ height: "100%", background: t.placeholder }} />}
                    <span style={{ position: "absolute", left: 14, bottom: 14, padding: "5px 12px", borderRadius: t.button === "pill" ? 999 : 4, backgroundColor: "rgba(0,0,0,0.55)", color: "#fff", fontSize: 12, fontWeight: 700 }}>{p.destination}</span>
                  </div>
                  <div style={{ padding: t.cards === "flat" ? "18px 0 0" : 20, display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
                    <h3 style={{ ...headingStyle(t, "1.25rem"), lineHeight: 1.25 }}>{p.title}</h3>
                    {p.period && <p style={{ margin: 0, color: "var(--s-muted)", fontSize: 14 }}>{p.period}</p>}
                    {p.includes.length > 0 && <p style={{ margin: 0, color: "var(--s-muted)", fontSize: 13 }}>{p.includes.join(" · ")}</p>}
                    <div style={{ marginTop: "auto", paddingTop: 10 }}>
                      {p.priceCents != null && <p style={{ margin: 0 }}><span style={{ display: "block", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--s-muted)" }}>a partir de</span><span style={{ fontSize: 24, fontWeight: 800, color: "var(--s-accent)" }}>{money(p.priceCents)}</span>{p.priceNote && <span style={{ marginLeft: 6, fontSize: 13, color: "var(--s-muted)" }}>{p.priceNote}</span>}</p>}
                      {p.installments && <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--s-muted)" }}>{p.installments}</p>}
                      {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle(t), marginTop: 14, width: "100%", padding: "0.7rem 1rem", fontSize: 14 }}>Quero este pacote</a>}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

function Features({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "diferenciais" }> }) {
  const t = ctx.theme;
  return (
    <section style={{ ...sectionPad(t), backgroundColor: "var(--s-surface)" }}>
      <div style={wrap}>
        <Title t={t} title={s.title} />
        <div style={{ display: "grid", gap: 28, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
          {s.items.map((it, i) => (
            <div key={i} style={{ paddingTop: 18, borderTop: `3px solid var(--s-accent)` }}>
              <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "var(--s-accent)" }}>{String(i + 1).padStart(2, "0")}</p>
              <h3 style={{ ...headingStyle(t, "1.3rem"), marginTop: 8, lineHeight: 1.25 }}>{it.title}</h3>
              <p style={{ margin: "10px 0 0", color: "var(--s-muted)", lineHeight: 1.6 }}>{it.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Steps({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "passos" }> }) {
  const t = ctx.theme;
  return (
    <section style={sectionPad(t)}>
      <div style={wrap}>
        <Title t={t} title={s.title} center />
        <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", counterReset: "step" }}>
          {s.items.map((it, i) => (
            <li key={i} style={{ ...cardStyle(t), padding: t.cards === "flat" ? "20px 0 0" : 24 }}>
              <span style={{ display: "inline-flex", width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: t.button === "pill" ? 999 : 6, backgroundColor: "var(--s-accent)", color: "var(--s-on-accent)", fontWeight: 800 }}>{i + 1}</span>
              <h3 style={{ ...headingStyle(t, "1.2rem"), marginTop: 14, lineHeight: 1.25 }}>{it.title}</h3>
              <p style={{ margin: "8px 0 0", color: "var(--s-muted)", lineHeight: 1.6 }}>{it.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Quotes({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "depoimentos" }> }) {
  const t = ctx.theme;
  if (!s.items.length) return null;
  return (
    <section style={{ ...sectionPad(t), backgroundColor: "var(--s-surface)" }}>
      <div style={wrap}>
        <Title t={t} title={s.title} />
        <div style={{ display: "grid", gap: 24, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {s.items.map((q, i) => (
            <figure key={i} style={{ margin: 0, padding: 28, borderRadius: t.radius, border: "1px solid var(--s-line)", backgroundColor: "var(--s-bg)" }}>
              <p aria-hidden style={{ margin: 0, fontFamily: t.heading.family, fontSize: 48, lineHeight: 0.6, color: "var(--s-accent)" }}>“</p>
              <blockquote style={{ margin: "12px 0 0", fontSize: 17, lineHeight: 1.6, fontFamily: t.heading.italic ? t.heading.family : undefined, fontStyle: t.heading.italic ? "italic" : "normal" }}>{q.text}</blockquote>
              <figcaption style={{ marginTop: 16, fontSize: 13, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--s-muted)" }}>{[q.author, q.place].filter(Boolean).join(" · ")}</figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function TextBlock({ ctx, s, flip }: { ctx: SiteCtx; s: Extract<Section, { type: "texto" }>; flip: boolean }) {
  const t = ctx.theme;
  return (
    <section style={sectionPad(t)}>
      <div style={{ ...wrap, display: "grid", gap: 48, alignItems: "center" }} className="md:grid-cols-2">
        <div style={{ order: flip ? 2 : 1, height: 420, borderRadius: t.radius, overflow: "hidden" }}><Photo ctx={ctx} id={s.imageId} /></div>
        <div style={{ order: flip ? 1 : 2 }}>
          <h2 style={headingStyle(t, "clamp(1.8rem, 3.4vw, 2.6rem)")}>{s.title}</h2>
          {s.text.split(/\n{2,}/).map((p, i) => <p key={i} style={{ margin: "16px 0 0", fontSize: 17, lineHeight: 1.7, color: "var(--s-muted)", whiteSpace: "pre-line" }}>{p}</p>)}
        </div>
      </div>
    </section>
  );
}

function Gallery({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "galeria" }> }) {
  const t = ctx.theme;
  const ids = s.imageIds.length ? s.imageIds : [null, null, null];
  return (
    <section style={sectionPad(t)}>
      <div style={wrap}>
        <Title t={t} title={s.title} />
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {ids.map((id, i) => <div key={id ?? i} style={{ height: 240, borderRadius: Math.min(t.radius, 16), overflow: "hidden" }}><Photo ctx={ctx} id={id} /></div>)}
        </div>
      </div>
    </section>
  );
}

function Faq({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "faq" }> }) {
  const t = ctx.theme;
  if (!s.items.length) return null;
  return (
    <section style={sectionPad(t)}>
      <div style={{ ...wrap, maxWidth: 860 }}>
        <Title t={t} title={s.title} center />
        <div>
          {s.items.map((f, i) => (
            <details key={i} style={{ borderBottom: "1px solid var(--s-line)", padding: "20px 0" }}>
              <summary style={{ cursor: "pointer", fontSize: 18, fontWeight: 600, listStyle: "none", display: "flex", justifyContent: "space-between", gap: 16 }}>{f.q}<span aria-hidden style={{ color: "var(--s-accent)" }}>+</span></summary>
              <p style={{ margin: "12px 0 0", color: "var(--s-muted)", lineHeight: 1.7 }}>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Band({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "chamada" }> }) {
  const t = ctx.theme;
  return (
    <section style={{ padding: "24px 0 80px" }}>
      <div style={wrap}>
        <div style={{ backgroundColor: "var(--s-band)", color: "var(--s-on-band)", borderRadius: t.radius, padding: "56px 40px", textAlign: "center" }}>
          <h2 style={{ ...headingStyle(t, "clamp(1.8rem, 3.6vw, 2.8rem)"), color: "var(--s-on-band)" }}>{s.title}</h2>
          {s.text && <p style={{ margin: "14px auto 0", maxWidth: 560, opacity: 0.85, fontSize: 17, lineHeight: 1.6 }}>{s.text}</p>}
          <div style={{ marginTop: 26 }}><MainButton ctx={ctx} label={s.button} /></div>
        </div>
      </div>
    </section>
  );
}

function Contact({ ctx, s }: { ctx: SiteCtx; s: Extract<Section, { type: "contato" }> }) {
  const t = ctx.theme;
  const b = ctx.content.brand;
  const wa = whatsHref(ctx, greeting(ctx));
  const cards = [
    wa && { label: "WhatsApp", value: b.whatsapp, href: wa },
    b.email && { label: "E-mail", value: b.email, href: `mailto:${b.email}` },
    b.instagram && { label: "Instagram", value: `@${b.instagram}`, href: `https://instagram.com/${b.instagram}` },
    b.facebook && { label: "Facebook", value: b.facebook, href: `https://facebook.com/${b.facebook}` },
    b.tiktok && { label: "TikTok", value: `@${b.tiktok}`, href: `https://www.tiktok.com/@${b.tiktok}` },
    b.city && { label: "Onde estamos", value: b.city, href: null },
    b.hours && { label: "Atendimento", value: b.hours, href: null },
  ].filter(Boolean) as { label: string; value: string; href: string | null }[];
  return (
    <section style={sectionPad(t)}>
      <div style={wrap}>
        <Title t={t} title={s.title} sub={s.text} />
        <div style={{ display: "grid", gap: 20, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          {cards.map((c) => {
            const inner = <><p style={{ margin: 0, fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--s-accent)" }}>{c.label}</p><p style={{ margin: "10px 0 0", fontSize: 18, fontWeight: 600, wordBreak: "break-word" }}>{c.value}</p></>;
            return c.href ? <a key={c.label} href={c.href} target="_blank" rel="noopener noreferrer" style={{ ...cardStyle(t), padding: t.cards === "flat" ? "20px 0" : 24, color: "inherit", textDecoration: "none" }}>{inner}</a> : <div key={c.label} style={{ ...cardStyle(t), padding: t.cards === "flat" ? "20px 0" : 24 }}>{inner}</div>;
          })}
        </div>
        {ctx.requestHref && !quoteTarget(ctx) && <div style={{ marginTop: 32 }}><a href={ctx.requestHref} style={btnStyle(t)}>Pedir cotação pelo formulário</a></div>}
      </div>
    </section>
  );
}

function SectionView({ ctx, s, index }: { ctx: SiteCtx; s: Section; index: number }) {
  switch (s.type) {
    case "hero": return <Hero ctx={ctx} s={s} />;
    case "selos": return <Seals ctx={ctx} s={s} />;
    case "cotacao": return <Quote ctx={ctx} s={s} />;
    case "milhas": return <Miles ctx={ctx} s={s} />;
    case "numeros": return <Numbers ctx={ctx} s={s} />;
    case "pacotes": return <Packages ctx={ctx} s={s} />;
    case "diferenciais": return <Features ctx={ctx} s={s} />;
    case "passos": return <Steps ctx={ctx} s={s} />;
    case "depoimentos": return <Quotes ctx={ctx} s={s} />;
    case "texto": return <TextBlock ctx={ctx} s={s} flip={index % 2 === 0} />;
    case "galeria": return <Gallery ctx={ctx} s={s} />;
    case "faq": return <Faq ctx={ctx} s={s} />;
    case "chamada": return <Band ctx={ctx} s={s} />;
    case "contato": return <Contact ctx={ctx} s={s} />;
  }
}

// ---------------- Cabeçalho, rodapé e página ----------------

function Header({ ctx }: { ctx: SiteCtx }) {
  const t = ctx.theme;
  const b = ctx.content.brand;
  const pages = SITE_PAGES.filter((p) => ctx.content.pages[p].on);
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 20, backgroundColor: "var(--s-bg)", borderBottom: "1px solid var(--s-line)" }}>
      <div style={{ ...wrap, display: "flex", alignItems: "center", gap: 20, minHeight: 72, flexWrap: "wrap" }}>
        <PageLink ctx={ctx} to="inicio" style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit", textDecoration: "none", marginRight: "auto" }}>
          {b.logoId && <img src={ctx.img(b.logoId)} alt="" style={{ height: 40, width: "auto", maxWidth: 140, objectFit: "contain" }} />}
          {b.name && <span style={{ ...headingStyle(t, "1.3rem"), lineHeight: 1.1 }}>{b.name}</span>}
        </PageLink>
        <nav style={{ display: "flex", gap: 22, flexWrap: "wrap", fontSize: 14, fontWeight: 600, textTransform: t.heading.upper ? "uppercase" : "none", letterSpacing: t.heading.upper ? "0.06em" : 0 }}>
          {pages.map((p) => <PageLink key={p} ctx={ctx} to={p} style={{ color: p === ctx.page ? "var(--s-accent)" : "inherit", textDecoration: "none" }}>{PAGE_LABELS[p]}</PageLink>)}
        </nav>
        <Socials ctx={ctx} size={18} />
        {/* principal ação do topo: pedir cotação (o WhatsApp segue no ícone ao lado e no botão flutuante).
            No celular ele fica só na barra fixa de baixo, sem repetir no topo. */}
        <span className="hidden md:inline-flex">
          {quoteLink(ctx) ? <QuoteButton ctx={ctx} label="Pedir cotação" /> : b.whatsapp && <MainButton ctx={ctx} label="Falar com a gente" />}
        </span>
      </div>
    </header>
  );
}

function Footer({ ctx }: { ctx: SiteCtx }) {
  const t = ctx.theme;
  const b = ctx.content.brand;
  const pages = SITE_PAGES.filter((p) => ctx.content.pages[p].on);
  return (
    <footer style={{ backgroundColor: "var(--s-band)", color: "var(--s-on-band)", padding: "56px 0 32px" }}>
      <div style={{ ...wrap, display: "grid", gap: 32, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
        <div>
          {b.name && <p style={{ ...headingStyle(t, "1.4rem"), color: "var(--s-on-band)" }}>{b.name}</p>}
          {b.tagline && <p style={{ margin: "8px 0 0", opacity: 0.75 }}>{b.tagline}</p>}
          {b.city && <p style={{ margin: "4px 0 0", opacity: 0.75 }}>{b.city}</p>}
        </div>
        <nav style={{ display: "grid", gap: 8, alignContent: "start" }}>
          {pages.map((p) => <PageLink key={p} ctx={ctx} to={p} style={{ color: "inherit", opacity: 0.85, textDecoration: "none" }}>{PAGE_LABELS[p]}</PageLink>)}
        </nav>
        <div style={{ display: "grid", gap: 8, alignContent: "start", opacity: 0.85 }}>
          <Socials ctx={ctx} size={20} />
          {b.whatsapp && <span>WhatsApp {b.whatsapp}</span>}
          {b.email && <span>{b.email}</span>}
          {b.hours && <span>{b.hours}</span>}
          {b.cnpj && <span>CNPJ {b.cnpj}</span>}
          {b.cadastur && <span>Cadastur {b.cadastur}</span>}
        </div>
      </div>
      <p style={{ ...wrap, marginTop: 40, fontSize: 13, opacity: 0.6 }}>© {new Date().getFullYear()}{b.name ? ` ${b.name}` : ""}</p>
    </footer>
  );
}

function Socials({ ctx, size }: { ctx: SiteCtx; size: number }) {
  const links = socialLinks(ctx.content.brand, whatsHref(ctx, greeting(ctx)));
  if (!links.length) return null;
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {links.map(({ key, label, href, Icon }) => <a key={key} href={href} target="_blank" rel="noopener noreferrer" aria-label={label} title={label} style={{ display: "inline-flex", padding: 6, borderRadius: 999, color: "inherit", opacity: 0.85 }}><Icon size={size} /></a>)}
    </div>
  );
}

/**
 * Fixos na tela: botão flutuante do WhatsApp (computador) e barra com "Pedir cotação" e WhatsApp
 * (celular). Na prévia do editor ficam presos ao fim da prévia, em vez de à janela.
 */
function Floating({ ctx }: { ctx: SiteCtx }) {
  const t = ctx.theme;
  const wa = whatsHref(ctx, greeting(ctx));
  const quote = !!quoteLink(ctx);
  if (!wa && !quote) return null;
  const pos: React.CSSProperties = ctx.embedded ? { position: "sticky", bottom: 0 } : { position: "fixed", left: 0, right: 0, bottom: 0 };
  return (
    <div style={{ ...pos, zIndex: 40, pointerEvents: "none", height: 0 }}>
      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp" className="hidden md:inline-flex"
          style={{ position: "absolute", right: 22, bottom: 22, width: 58, height: 58, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: "#25d366", color: "#fff", boxShadow: "0 10px 24px -6px rgba(0,0,0,0.35)", pointerEvents: "auto" }}>
          <WhatsappIcon size={30} />
        </a>
      )}
      <div className="flex md:hidden" style={{ position: "absolute", left: 0, right: 0, bottom: 0, gap: 8, padding: 10, backgroundColor: "var(--s-bg)", borderTop: "1px solid var(--s-line)", pointerEvents: "auto" }}>
        {quote && <QuoteButton ctx={ctx} label="Pedir cotação" />}
        {wa && <a href={wa} target="_blank" rel="noopener noreferrer" style={{ ...btnStyle(t), flex: quote ? undefined : 1, backgroundColor: "#25d366", color: "#fff" }}><WhatsappIcon size={18} />WhatsApp</a>}
      </div>
    </div>
  );
}

export function SiteView({ ctx }: { ctx: SiteCtx }) {
  const sections = ctx.content.pages[ctx.page].sections.filter((s) => s.on);
  return (
    <div style={vars(ctx.theme, ctx.content.brand.accent)} className="min-h-full">
      <Header ctx={ctx} />
      <main>{sections.map((s, i) => <SectionView key={i} ctx={ctx} s={s} index={i} />)}</main>
      <Footer ctx={ctx} />
      <div className="h-16 md:hidden" aria-hidden />
      <Floating ctx={ctx} />
    </div>
  );
}
