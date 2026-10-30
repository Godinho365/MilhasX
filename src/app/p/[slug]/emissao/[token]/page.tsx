import { notFound } from "next/navigation";
import { appName, publicBrand } from "@/server/session";
import { ownerBranding } from "@/server/services/client-pages";
import { publicDeal } from "@/server/services/miles-deals";
import { bannerUrl } from "@/domain/page-design";
import { PageShell } from "../../central";
import { EmissaoView } from "./view";

export const dynamic = "force-dynamic";
export const metadata = { title: `Dados para a emissão — ${publicBrand()}`, robots: { index: false } };

type P = { params: Promise<{ slug: string; token: string }> };

// CRM Milhas: página do comprador com o resumo da emissão, os dados dos passageiros e o localizador.
export default async function EmissaoPage({ params }: P) {
  const { slug, token } = await params;
  const r = await publicDeal(slug, token);
  if (!r) notFound();
  const b = await ownerBranding(r.userId);
  return (
    <PageShell brand={publicBrand()} appName={appName()} bgColor={b.design.bgColor} banner={bannerUrl(slug, b.bannerVersion)}>
      <EmissaoView slug={slug} token={token} agency={b.agency} whatsapp={b.whatsapp} deal={r.deal} />
    </PageShell>
  );
}
