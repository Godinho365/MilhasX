// Página pública do site da agência (servidor): carrega o site publicado e desenha com o tema escolhido.
import { notFound } from "next/navigation";
import { publicSite } from "@/server/services/site";
import { themeById } from "@/domain/site-themes";
import { pagePath, PAGE_LABELS, SITE_PAGES, type SitePage } from "@/domain/site";
import { SiteView } from "@/components/site/site-view";

export async function siteMetadata(slug: string, page: SitePage) {
  const s = await publicSite(slug);
  if (!s) return { title: "Site não encontrado", robots: { index: false } };
  const b = s.content.brand;
  const name = b.name || "Site";
  const title = page === "inicio" ? `${name}${b.tagline ? ` · ${b.tagline}` : ""}` : `${PAGE_LABELS[page]} · ${name}`;
  const hero = s.content.pages[page].sections.find((x) => x.type === "hero" && x.on);
  const description = hero && hero.type === "hero" ? hero.text || hero.title : b.tagline;
  return { title, description, openGraph: { title, description, type: "website" } };
}

export async function SitePageView({ slug, page }: { slug: string; page: string }) {
  if (!(SITE_PAGES as readonly string[]).includes(page)) notFound();
  const p = page as SitePage;
  const s = await publicSite(slug);
  if (!s || !s.content.pages[p].on) notFound();
  const base = `/s/${s.slug}`;
  // Dados estruturados (schema.org): o Google entende que é uma agência de viagens, com contatos e redes
  const b = s.content.brand;
  const ld = {
    "@context": "https://schema.org", "@type": "TravelAgency", name: b.name || undefined, description: b.tagline || undefined,
    telephone: b.whatsapp || undefined, email: b.email || undefined, openingHours: b.hours || undefined,
    address: b.city ? { "@type": "PostalAddress", addressLocality: b.city, addressCountry: "BR" } : undefined,
    sameAs: [b.instagram && `https://instagram.com/${b.instagram}`, b.facebook && `https://facebook.com/${b.facebook}`, b.tiktok && `https://www.tiktok.com/@${b.tiktok}`].filter(Boolean),
  };
  return (
    <div style={{ minHeight: "100vh" }}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <SiteView ctx={{
        theme: themeById(s.theme), content: s.content, page: p, packages: s.packages,
        href: (to) => `${base}${pagePath(to)}`,
        img: (id) => `/api/public/site/${s.slug}/image/${id}`,
        pkgImg: (pk) => (pk.imageVersion ? `/api/public/site/${s.slug}/package/${pk.id}?v=${pk.imageVersion}` : null),
        requestHref: s.canRequest ? `/p/${s.slug}/solicitar` : null, slug: s.slug,
      }} />
    </div>
  );
}
