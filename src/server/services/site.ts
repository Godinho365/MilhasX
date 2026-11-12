// Site da agência (Marketing › Site): tema, conteúdo das páginas e fotos. O endereço é o mesmo da
// página da agência (/s/<endereço>); se ela ainda não existe, nasce junto, sem publicar a Central.
import type { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { detectImage } from "./extras";
import { resolveDesign, type PageDesign } from "@/domain/page-design";
import { defaultContent, imageIdsOf, normalizeContent, type SiteContent } from "@/domain/site";
import { SITE_THEMES, themeById } from "@/domain/site-themes";
import { centralLook, type CentralLook } from "@/domain/central-look";

const MAX_IMAGE = 3 * 1024 * 1024;
const MAX_IMAGES = 60;

async function agencyDefaults(userId: string) {
  const [u, p] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { name: true } }),
    prisma.salesProfile.findUnique({ where: { userId }, select: { slug: true, displayName: true, whatsapp: true, email: true, instagram: true, published: true, acceptsOrders: true } }),
  ]);
  return { profile: p, base: defaultContent({ name: p?.displayName || u?.name || "Minha agência", whatsapp: p?.whatsapp, email: p?.email, instagram: p?.instagram }) };
}

/** Se o site da agência já foi montado e se está publicado (para a aba "Sua MilhasX"). */
export async function siteStatus(userId: string) {
  const s = await prisma.agencySite.findUnique({ where: { userId }, select: { published: true } });
  return { exists: !!s, published: s?.published ?? false };
}

export async function getSite(userId: string) {
  const [{ profile, base }, site] = await Promise.all([agencyDefaults(userId), prisma.agencySite.findUnique({ where: { userId } })]);
  return {
    slug: profile?.slug ?? null,
    exists: !!site,
    theme: site?.theme ?? null,
    published: site?.published ?? false,
    content: site ? normalizeContent(site.content, base) : base,
    canRequest: !!(profile?.published && profile.acceptsOrders),
  };
}

export async function saveSite(userId: string, input: { slug?: string | null; theme: string; published: boolean; content?: unknown }) {
  if (!SITE_THEMES.some((t) => t.id === input.theme)) throw new DomainError(400, "Tema não encontrado");
  const { profile, base } = await agencyDefaults(userId);
  const content = normalizeContent(input.content, base);
  // as fotos do conteúdo precisam ser do próprio dono
  const ids = [...imageIdsOf(content)];
  if (ids.length && (await prisma.siteImage.count({ where: { id: { in: ids }, userId } })) !== ids.length) throw new DomainError(404, "Foto não encontrada");
  if (!profile) {
    const slug = input.slug?.trim().toLowerCase();
    if (!slug) throw new DomainError(400, "Escolha o endereço do site");
    if (await prisma.salesProfile.findUnique({ where: { slug }, select: { userId: true } })) throw new DomainError(409, "Esse endereço já está em uso");
    await prisma.salesProfile.create({ data: { userId, slug, displayName: content.brand.name || base.brand.name, published: false, programIds: [], design: resolveDesign(null) as unknown as Prisma.InputJsonValue } });
  }
  const data = { theme: input.theme, published: input.published, content: content as unknown as Prisma.InputJsonValue };
  await prisma.agencySite.upsert({ where: { userId }, update: data, create: { userId, ...data } });
  return getSite(userId);
}

export async function uploadSiteImage(userId: string, buf: Buffer) {
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_IMAGE) throw new DomainError(413, "Foto maior que 3 MB");
  const mime = detectImage(buf);
  if (!mime) throw new DomainError(415, "Envie uma foto JPG, PNG ou WebP");
  if ((await prisma.siteImage.count({ where: { userId } })) >= MAX_IMAGES) throw new DomainError(409, `No máximo ${MAX_IMAGES} fotos no site`);
  return (await prisma.siteImage.create({ data: { userId, mime, size: buf.length, data: new Uint8Array(buf) } })).id;
}

export async function ownSiteImage(userId: string, id: string) {
  const i = await prisma.siteImage.findFirst({ where: { id, userId }, select: { data: true, mime: true } });
  return i ? { data: Buffer.from(i.data), mime: i.mime } : null;
}

/** O site da agência está no ar? (os formulários de cotação e de milhas também valem dentro dele) */
export async function sitePublished(userId: string) {
  return !!(await prisma.agencySite.findFirst({ where: { userId, published: true }, select: { userId: true } }));
}

/** Visual da Central de atendimento: o tema do site salvo, se a agência tem site e não desligou essa opção. */
export async function centralLookFor(userId: string, design: PageDesign): Promise<CentralLook | null> {
  if (!design.siteTheme) return null;
  const s = await prisma.agencySite.findUnique({ where: { userId }, select: { theme: true, content: true } });
  if (!s) return null;
  const accent = (s.content as { brand?: { accent?: unknown } } | null)?.brand?.accent;
  return centralLook(themeById(s.theme), typeof accent === "string" ? accent : null);
}

/** Dono do site publicado: endereço existe, site no ar e conta ativa (vale para páginas e fotos). */
async function publishedSite(slug: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, slug: true, published: true, acceptsOrders: true } });
  if (!p) return null;
  const [site, owner] = await Promise.all([
    prisma.agencySite.findUnique({ where: { userId: p.userId } }),
    prisma.user.findUnique({ where: { id: p.userId }, select: { status: true, name: true } }),
  ]);
  if (!site?.published || owner?.status !== "ACTIVE") return null;
  const content: SiteContent = normalizeContent(site.content, defaultContent({ name: owner.name }));
  return { userId: p.userId, slug: p.slug, theme: site.theme, content, canRequest: p.published && p.acceptsOrders };
}

export async function publicSite(slug: string) {
  const s = await publishedSite(slug);
  if (!s) return null;
  const packages = await prisma.showcaseItem.findMany({ where: { userId: s.userId, active: true }, omit: { image: true }, orderBy: [{ position: "asc" }, { createdAt: "desc" }], take: 24 });
  return {
    slug: s.slug, theme: s.theme, content: s.content, canRequest: s.canRequest,
    packages: packages.map((i) => ({ id: i.id, title: i.title, destination: i.destination, period: i.period, includes: i.includes, description: i.description, priceCents: i.priceCents, priceNote: i.priceNote, installments: i.installments, imageVersion: i.imageUpdatedAt ? String(i.imageUpdatedAt.getTime()) : null })),
  };
}

/** Foto pública: só as usadas no conteúdo do site publicado. */
export async function publicSiteImage(slug: string, id: string) {
  const s = await publishedSite(slug);
  if (!s || !imageIdsOf(s.content).has(id)) return null;
  return ownSiteImage(s.userId, id);
}

/** Foto de um pacote da Vitrine mostrado no site publicado. */
export async function publicSitePackageImage(slug: string, id: string) {
  const s = await publishedSite(slug);
  if (!s) return null;
  const i = await prisma.showcaseItem.findFirst({ where: { id, userId: s.userId, active: true }, select: { image: true, imageMime: true } });
  return i?.image && i.imageMime ? { data: Buffer.from(i.image), mime: i.imageMime } : null;
}
