import { createHash, randomBytes } from "node:crypto";
import { prisma, DomainError } from "../db";
import { hasFeature } from "./plan-limits";
import { resolveDesign } from "@/domain/page-design";
import type { Segment } from "@/domain/orders";

// Páginas que o cliente recebe por link (Cotação, Reserva confirmada, Assinatura de contrato) com a
// personalização da "Sua MilhasX" do dono. Os links de pedido usam um token aleatório por pedido.

const SIGN_PER_HOUR = 5;

/** Visual da página do dono (cor, banner, textos), mesmo sem a Bio publicada. */
export async function ownerBranding(userId: string) {
  const p = await prisma.salesProfile.findUnique({ where: { userId }, omit: { banner: true } });
  const design = resolveDesign(p?.design);
  const branded = await hasFeature(userId, "pageBranding");
  if (!branded) Object.assign(design, { bgColor: null, share: { title: "", description: "" } });
  return {
    slug: p?.slug ?? null,
    whatsapp: p?.whatsapp ?? null,
    design,
    // O banner só é servido para página publicada (ver getBanner)
    bannerVersion: branded && p?.published && p.bannerUpdatedAt ? String(p.bannerUpdatedAt.getTime()) : null,
  };
}

/** Gera (uma vez) o link do pedido para o cliente. */
export async function orderShareToken(userId: string, orderId: string) {
  const o = await prisma.travelOrder.findFirst({ where: { id: orderId, userId }, select: { shareToken: true } });
  if (!o) throw new DomainError(404, "Pedido não encontrado");
  if (o.shareToken) return o.shareToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.travelOrder.update({ where: { id: orderId }, data: { shareToken: token } });
  return token;
}

export async function setOrderClientInfo(userId: string, orderId: string, input: { locator?: string | null; clientNotes?: string | null }) {
  const { count } = await prisma.travelOrder.updateMany({
    where: { id: orderId, userId },
    data: { locator: input.locator?.trim().toUpperCase() || null, clientNotes: input.clientNotes?.trim() || null },
  });
  if (!count) throw new DomainError(404, "Pedido não encontrado");
}

/** Pedido visto pelo cliente: só o que interessa a ele (sem custos, milhas nem anotações internas). */
export async function publicOrder(slug: string, token: string) {
  const o = await prisma.travelOrder.findUnique({
    where: { shareToken: token },
    include: {
      user: { select: { status: true, salesProfile: { select: { slug: true } } } },
      quotes: { orderBy: { createdAt: "asc" } },
      attachments: { where: { visibleToClient: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
  });
  if (!o || o.user.status !== "ACTIVE" || o.user.salesProfile?.slug !== slug.toLowerCase()) return null;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    userId: o.userId,
    order: {
      number: o.number,
      customerName: o.customerName,
      cabin: o.cabin,
      segments: (o.segments as Segment[]).map((s) => ({ origin: s.origin, destination: s.destination, date: s.date ?? null })),
      adults: o.adults,
      children: o.children,
      infants: o.infants,
      locator: o.locator,
      clientNotes: o.clientNotes,
      quotes: o.quotes.map((q) => ({ id: q.id, origin: q.origin, destination: q.destination, departDate: iso(q.departDate), returnDate: q.returnDate ? iso(q.returnDate) : null, cabin: q.cabin, adults: q.adults, cashCents: q.cashCents, taxesCents: q.taxesCents, notes: q.notes })),
      files: o.attachments,
    },
  };
}

export async function publicOrderFile(token: string, fileId: string) {
  const f = await prisma.orderAttachment.findFirst({ where: { id: fileId, visibleToClient: true, order: { shareToken: token, user: { status: "ACTIVE" } } } });
  if (!f) throw new DomainError(404, "Arquivo não encontrado");
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data) };
}

/** Dono da página de contrato: exige a página publicada, como os outros formulários públicos. */
export async function contractOwner(slug: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, published: true, user: { select: { status: true } } } });
  return p && p.published && p.user.status === "ACTIVE" ? p.userId : null;
}

export async function signContract(slug: string, input: { name: string; email?: string | null; phone?: string | null }, ip: string) {
  const userId = await contractOwner(slug);
  if (!userId) throw new DomainError(404, "Página não encontrada");
  if (!input.phone?.trim() && !input.email?.trim()) throw new DomainError(400, "Informe um telefone ou e-mail para contato");
  const ipHash = createHash("sha256").update(`contract:${slug}:${ip}`).digest("hex").slice(0, 32);
  if ((await prisma.contractSignature.count({ where: { userId, ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= SIGN_PER_HOUR) throw new DomainError(429, "Muitos envios. Tente de novo mais tarde.");
  const { design } = await ownerBranding(userId);
  const s = await prisma.contractSignature.create({
    data: { userId, name: input.name.trim(), email: input.email?.trim() || null, phone: input.phone?.trim() || null, terms: design.contrato.terms, ipHash },
  });
  await prisma.notification.create({ data: { userId, title: "Contrato assinado", body: `${s.name} assinou o contrato de gestão de milhas.` } });
  return { ok: true };
}

export async function listSignatures(userId: string) {
  const rows = await prisma.contractSignature.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, email: true, phone: true, createdAt: true } });
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}
