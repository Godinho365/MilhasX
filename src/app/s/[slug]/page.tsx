import { SitePageView, siteMetadata } from "./site-page";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: P) {
  return siteMetadata((await params).slug, "inicio");
}

// Site da agência: página inicial
export default async function SiteHome({ params }: P) {
  return <SitePageView slug={(await params).slug} page="inicio" />;
}
