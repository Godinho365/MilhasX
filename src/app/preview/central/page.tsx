import { requirePageUser, appName, publicBrand } from "@/server/session";
import { getSalesProfile } from "@/server/services/settings";
import { listPrograms } from "@/server/services/admin";
import { resolveDesign } from "@/domain/page-design";
import { PreviewClient } from "./client";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false } };

// Prévia do editor "Sua página": abre num iframe e recebe o rascunho do editor por postMessage,
// então mostra as mudanças antes de salvar e na largura real de cada aparelho.
export default async function CentralPreview() {
  const user = await requirePageUser();
  const p = await getSalesProfile(user.id);
  const programs = (await listPrograms(false)).map((x) => ({ id: x.id, name: x.name, color: x.color }));
  const initial = {
    slug: p?.slug ?? "sua-pagina",
    displayName: p?.displayName ?? user.name,
    headline: p?.headline ?? null,
    bio: p?.bio ?? null,
    whatsapp: p?.whatsapp ?? null,
    instagram: p?.instagram ?? null,
    email: p?.email ?? null,
    acceptsOrders: p?.acceptsOrders ?? true,
    acceptsLeads: p?.acceptsLeads ?? true,
    programs: programs.filter((x) => p?.programIds.includes(x.id)),
    design: resolveDesign(p?.design),
    bannerVersion: p?.bannerUpdatedAt ? String(p.bannerUpdatedAt.getTime()) : null,
  };
  return <PreviewClient initial={initial} programs={programs} brand={publicBrand()} appName={appName()} />;
}
