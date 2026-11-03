// Vitrine de pacotes: cards montados a partir das cotações do CRM e publicados numa página pública
// (/p/<slug>/vitrine). Desligada, a página responde "não encontrada".
import { prisma, DomainError } from "../db";
import { detectImage } from "./extras";
import { resolveProposal, cityOf } from "@/domain/proposal";

const MAX_IMAGE = 2 * 1024 * 1024;

export type ShowcaseInput = {
  title: string; destination: string; period?: string | null; includes?: string[]; description?: string | null;
  priceCents?: number | null; priceNote?: string | null; installments?: string | null; active?: boolean; orderId?: string | null;
};

const view = (i: { id: string; orderId: string | null; title: string; destination: string; period: string | null; includes: string[]; description: string | null; priceCents: number | null; priceNote: string | null; installments: string | null; imageUpdatedAt: Date | null; active: boolean; position: number }) => ({
  id: i.id, orderId: i.orderId, title: i.title, destination: i.destination, period: i.period, includes: i.includes, description: i.description,
  priceCents: i.priceCents, priceNote: i.priceNote, installments: i.installments, imageVersion: i.imageUpdatedAt ? String(i.imageUpdatedAt.getTime()) : null,
  active: i.active, position: i.position,
});
const omit = { image: true } as const;

export async function showcaseSettings(userId: string) {
  const p = await prisma.salesProfile.findUnique({ where: { userId }, select: { slug: true, showcaseActive: true, showcaseTitle: true, published: true } });
  return p ? { slug: p.slug, active: p.showcaseActive, title: p.showcaseTitle, profilePublished: p.published } : null;
}

export async function saveShowcaseSettings(userId: string, input: { active: boolean; title?: string | null }) {
  const r = await prisma.salesProfile.updateMany({ where: { userId }, data: { showcaseActive: input.active, showcaseTitle: input.title?.trim() || null } });
  if (!r.count) throw new DomainError(400, "Crie antes a sua página em Marketing › Site (endereço da agência)");
}

export async function listShowcase(userId: string) {
  const rows = await prisma.showcaseItem.findMany({ where: { userId }, omit, orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  return rows.map(view);
}

function clean(input: ShowcaseInput) {
  const t = (v?: string | null, max = 200) => v?.trim().slice(0, max) || null;
  return {
    title: input.title.trim(), destination: input.destination.trim(), period: t(input.period, 80), description: t(input.description, 1000),
    includes: [...new Set((input.includes ?? []).map((x) => x.trim()).filter(Boolean))].slice(0, 8),
    priceCents: input.priceCents ?? null, priceNote: t(input.priceNote, 60), installments: t(input.installments, 60),
    ...(input.active !== undefined ? { active: input.active } : {}),
  };
}

export async function saveShowcaseItem(userId: string, id: string | null, input: ShowcaseInput) {
  if (input.orderId && !(await prisma.travelOrder.findFirst({ where: { id: input.orderId, userId }, select: { id: true } }))) throw new DomainError(404, "Cotação não encontrada");
  if (!id) {
    // card novo entra no começo da vitrine
    await prisma.showcaseItem.updateMany({ where: { userId }, data: { position: { increment: 1 } } });
    return (await prisma.showcaseItem.create({ data: { userId, orderId: input.orderId ?? null, ...clean(input), position: 0 } })).id;
  }
  const r = await prisma.showcaseItem.updateMany({ where: { id, userId }, data: clean(input) });
  if (!r.count) throw new DomainError(404, "Card não encontrado");
  return id;
}

export async function deleteShowcaseItem(userId: string, id: string) {
  const r = await prisma.showcaseItem.deleteMany({ where: { id, userId } });
  if (!r.count) throw new DomainError(404, "Card não encontrado");
}

/** Sobe ou desce o card uma posição. */
export async function moveShowcaseItem(userId: string, id: string, dir: -1 | 1) {
  const all = await prisma.showcaseItem.findMany({ where: { userId }, select: { id: true }, orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  const i = all.findIndex((x) => x.id === id);
  if (i < 0) throw new DomainError(404, "Card não encontrado");
  const j = i + dir;
  if (j < 0 || j >= all.length) return;
  [all[i], all[j]] = [all[j]!, all[i]!];
  await prisma.$transaction(all.map((x, k) => prisma.showcaseItem.update({ where: { id: x.id }, data: { position: k } })));
}

export async function setShowcaseImage(userId: string, id: string, buf: Buffer) {
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_IMAGE) throw new DomainError(413, "Imagem maior que 2 MB");
  const mime = detectImage(buf);
  if (!mime) throw new DomainError(415, "Envie uma imagem JPG, PNG ou WebP");
  const r = await prisma.showcaseItem.updateMany({ where: { id, userId }, data: { image: new Uint8Array(buf), imageMime: mime, imageUpdatedAt: new Date() } });
  if (!r.count) throw new DomainError(404, "Card não encontrado");
}

export async function removeShowcaseImage(userId: string, id: string) {
  const r = await prisma.showcaseItem.updateMany({ where: { id, userId }, data: { image: null, imageMime: null, imageUpdatedAt: null } });
  if (!r.count) throw new DomainError(404, "Card não encontrado");
}

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "UTC" }).replace(".", "");

/** Cotações do CRM que já têm voos montados, para virar card. */
export async function showcaseCandidates(userId: string) {
  const rows = await prisma.travelOrder.findMany({ where: { userId, archivedAt: null }, select: { id: true, number: true, customerName: true, proposal: true, updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 200 });
  return rows.filter((o) => o.proposal).slice(0, 50).map((o) => ({ o, p: resolveProposal(o.proposal) })).filter(({ p }) => p.legs.length > 0).map(({ o, p }) => ({
    id: o.id, number: o.number, customer: o.customerName, route: `${p.legs[0]!.origin} → ${p.legs[0]!.destination}${p.legs.length > 1 ? " (ida e volta)" : ""}`, updatedAt: o.updatedAt.toISOString(),
  }));
}

/** Sugestão de card a partir da cotação: destino, período, o que inclui e o preço por pessoa. Nada do cliente vai para o card. */
export async function suggestFromOrder(userId: string, orderId: string): Promise<ShowcaseInput> {
  const o = await prisma.travelOrder.findFirst({ where: { id: orderId, userId }, select: { proposal: true, adults: true, children: true, infants: true } });
  if (!o) throw new DomainError(404, "Cotação não encontrada");
  const p = resolveProposal(o.proposal);
  if (!p.legs.length) throw new DomainError(400, "Essa cotação ainda não tem voos");
  const first = p.legs[0]!, last = p.legs[p.legs.length - 1]!;
  const city = cityOf(first.destination);
  const pax = Math.max(1, o.adults + o.children + o.infants);
  const total = p.pixCents ?? p.fullCents;
  const includes = [p.legs.length > 1 ? "Aéreo ida e volta" : "Aéreo só ida", ...(p.baggage.checked > 0 ? [`${p.baggage.checked} bagagem despachada`] : []), ...(p.baggage.carryOn > 0 ? ["Bagagem de mão"] : [])];
  if (first.airline) includes.push(first.airline);
  return {
    orderId, title: `${city} saindo de ${cityOf(first.origin)}`, destination: city,
    period: first.date ? (p.legs.length > 1 && last.date && last.date !== first.date ? `${fmtDay(first.date)} a ${fmtDay(last.date)}` : fmtDay(first.date)) : null,
    includes, priceCents: total != null ? Math.round(total / pax) : null, priceNote: "por pessoa",
    installments: p.cardInstallments && p.cardInstallments > 1 ? `ou em até ${p.cardInstallments}x no cartão` : null,
  };
}

/** Página pública: só com a vitrine ligada e a conta ativa; só os cards ativos. */
export async function publicShowcase(slug: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, slug: true, displayName: true, whatsapp: true, instagram: true, showcaseActive: true, showcaseTitle: true, acceptsOrders: true, published: true, design: true, bannerUpdatedAt: true } });
  if (!p || !p.showcaseActive) return null;
  const owner = await prisma.user.findUnique({ where: { id: p.userId }, select: { status: true } });
  if (owner?.status !== "ACTIVE") return null;
  const items = await prisma.showcaseItem.findMany({ where: { userId: p.userId, active: true }, omit, orderBy: [{ position: "asc" }, { createdAt: "desc" }] });
  return { slug: p.slug, agency: p.displayName, whatsapp: p.whatsapp, instagram: p.instagram, title: p.showcaseTitle, canRequest: p.published && p.acceptsOrders, items: items.map(view) };
}

export async function showcaseImage(slug: string, id: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, showcaseActive: true } });
  if (!p?.showcaseActive) return null;
  const i = await prisma.showcaseItem.findFirst({ where: { id, userId: p.userId, active: true }, select: { image: true, imageMime: true } });
  return i?.image && i.imageMime ? { data: Buffer.from(i.image), mime: i.imageMime } : null;
}

/** Foto do card no app (dono, mesmo com o card inativo). */
export async function ownShowcaseImage(userId: string, id: string) {
  const i = await prisma.showcaseItem.findFirst({ where: { id, userId }, select: { image: true, imageMime: true } });
  return i?.image && i.imageMime ? { data: Buffer.from(i.image), mime: i.imageMime } : null;
}
