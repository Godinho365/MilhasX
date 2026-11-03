import { SitePageView, siteMetadata } from "../site-page";
import { SITE_PAGES, type SitePage } from "@/domain/site";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string; page: string }> };

export async function generateMetadata({ params }: P) {
  const { slug, page } = await params;
  return (SITE_PAGES as readonly string[]).includes(page) ? siteMetadata(slug, page as SitePage) : { title: "Página não encontrada" };
}

// Site da agência: Destinos, Sobre nós e Contato
export default async function SiteSubpage({ params }: P) {
  const { slug, page } = await params;
  return <SitePageView slug={slug} page={page} />;
}
