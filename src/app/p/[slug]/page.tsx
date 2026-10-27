import { notFound } from "next/navigation";
import { publicSalesProfile } from "@/server/services/settings";
import { appName, publicBrand } from "@/server/session";
import { countPublicView } from "@/server/services/orders";
import { CentralPage } from "./central";

export const dynamic = "force-dynamic";

// "Prévia do link ao compartilhar": título, descrição e imagem (o banner) que WhatsApp,
// Instagram etc. mostram quando alguém cola o endereço.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const p = await publicSalesProfile((await params).slug);
  if (!p) return { title: publicBrand() };
  const title = p.design.share.title || `${p.displayName} · Central de Atendimento — ${publicBrand()}`;
  const description = p.design.share.description || p.headline || "Sua viagem começa aqui";
  const images = p.bannerVersion ? [`/api/public/banner/${p.slug}?v=${p.bannerVersion}`] : undefined;
  return { title, description, robots: { index: false }, openGraph: { title, description, images, type: "website" } };
}

// Central de Atendimento da agência (como a página da agência na simbora.la): mostra só o que
// o dono escolheu publicar e recebe pedidos de cotação e interessados em gestão de milhas.
export default async function PublicProfile({ params }: { params: Promise<{ slug: string }> }) {
  const p = await publicSalesProfile((await params).slug);
  if (!p) notFound();
  await countPublicView(p.slug);
  return <CentralPage data={p} brand={publicBrand()} appName={appName()} />;
}
