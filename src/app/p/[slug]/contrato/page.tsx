import { notFound } from "next/navigation";
import { appName, publicBrand } from "@/server/session";
import { contractOwner, ownerBranding } from "@/server/services/client-pages";
import { PageShell } from "../central";
import { bannerUrl } from "@/domain/page-design";
import { ContratoView } from "../pages";

export const dynamic = "force-dynamic";
export const metadata = { title: "Assinatura de contrato", robots: { index: false } };

// Página "Assinatura de contrato": o cliente da gestão de milhas lê os termos e aceita.
export default async function ContratoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const userId = await contractOwner(slug);
  if (!userId) notFound();
  const b = await ownerBranding(userId);
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={bannerUrl(slug, b.bannerVersion)}>
      <ContratoView design={b.design.contrato} slug={slug} />
    </PageShell>
  );
}
