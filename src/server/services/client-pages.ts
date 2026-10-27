import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma, DomainError } from "../db";
import { hasFeature } from "./plan-limits";
import { resolveDesign } from "@/domain/page-design";
import { resolveProposal, resolveReservation, contractText, type Proposal, type Reservation } from "@/domain/proposal";
import type { Segment } from "@/domain/orders";

// Páginas que o cliente recebe por link (Cotação, Reserva confirmada, Termo de compra e venda),
// com a personalização da "Sua MilhasX" do dono. Cada pedido tem um token aleatório no link e,
// se o pedido tem telefone, o cliente ainda confirma os 4 últimos dígitos antes de ver os dados.

const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const ACCESS_DAYS = 30;
const MAX_FAILS = 5; // tentativas erradas por pedido a cada 15 minutos
const SIGN_PER_HOUR = 5;

/** Visual da página do dono (cor, banner, textos), mesmo sem a Bio publicada. */
export async function ownerBranding(userId: string) {
  const p = await prisma.salesProfile.findUnique({ where: { userId }, omit: { banner: true } });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  const design = resolveDesign(p?.design);
  const branded = await hasFeature(userId, "pageBranding");
  if (!branded) Object.assign(design, { bgColor: null, share: { title: "", description: "" } });
  return {
    slug: p?.slug ?? null,
    agency: p?.displayName ?? user?.name ?? "",
    whatsapp: p?.whatsapp ?? null,
    design,
    // O banner só é servido para página publicada (ver getBanner)
    bannerVersion: branded && p?.published && p.bannerUpdatedAt ? String(p.bannerUpdatedAt.getTime()) : null,
  };
}

/* ---------------- Link e dados do pedido (lado do dono, no CRM) ---------------- */

/** Gera (uma vez) o link do pedido para o cliente. */
export async function orderShareToken(userId: string, orderId: string) {
  const o = await prisma.travelOrder.findFirst({ where: { id: orderId, userId }, select: { shareToken: true } });
  if (!o) throw new DomainError(404, "Pedido não encontrado");
  if (o.shareToken) return o.shareToken;
  const token = randomBytes(18).toString("base64url");
  await prisma.travelOrder.update({ where: { id: orderId }, data: { shareToken: token } });
  return token;
}

export async function setOrderClientInfo(userId: string, orderId: string, input: { locator?: string | null; clientNotes?: string | null; proposal?: unknown; reservation?: unknown }) {
  const data: Prisma.TravelOrderUpdateManyMutationInput = {};
  if (input.locator !== undefined) data.locator = input.locator?.trim().toUpperCase() || null;
  if (input.clientNotes !== undefined) data.clientNotes = input.clientNotes?.trim() || null;
  if (input.proposal !== undefined) data.proposal = input.proposal === null ? Prisma.DbNull : (resolveProposal(input.proposal) as unknown as Prisma.InputJsonValue);
  if (input.reservation !== undefined) data.reservation = input.reservation === null ? Prisma.DbNull : (resolveReservation(input.reservation) as unknown as Prisma.InputJsonValue);
  const { count } = await prisma.travelOrder.updateMany({ where: { id: orderId, userId }, data });
  if (!count) throw new DomainError(404, "Pedido não encontrado");
}

/** O que o CRM mostra na seção "Para o cliente". */
export async function orderClientInfo(userId: string, orderId: string) {
  const o = await prisma.travelOrder.findFirst({
    where: { id: orderId, userId },
    select: { shareToken: true, locator: true, clientNotes: true, proposal: true, reservation: true, signatures: { orderBy: { createdAt: "desc" }, take: 1, select: { name: true, createdAt: true } } },
  });
  if (!o) throw new DomainError(404, "Pedido não encontrado");
  const slug = (await prisma.salesProfile.findUnique({ where: { userId }, select: { slug: true } }))?.slug ?? null;
  return {
    slug, token: o.shareToken, locator: o.locator, clientNotes: o.clientNotes,
    proposal: o.proposal ? resolveProposal(o.proposal) : null,
    reservation: o.reservation ? resolveReservation(o.reservation) : null,
    signed: o.signatures[0] ? { name: o.signatures[0].name, at: o.signatures[0].createdAt.toISOString() } : null,
  };
}

/* ---------------- Acesso do cliente (4 últimos dígitos do telefone) ---------------- */

const lastDigits = (phone: string | null) => (phone ?? "").replace(/\D/g, "").slice(-4);
export const accessCookie = (token: string) => `mxo_${sha(token).slice(0, 12)}`;

async function orderByToken(slug: string, token: string) {
  const o = await prisma.travelOrder.findUnique({ where: { shareToken: token }, select: { id: true, userId: true, customerPhone: true, user: { select: { status: true, salesProfile: { select: { slug: true } } } } } });
  if (!o || o.user.status !== "ACTIVE" || o.user.salesProfile?.slug !== slug.toLowerCase()) return null;
  return o;
}

/** Pedido sem telefone não tem o que conferir: o link (aleatório) basta. */
export async function hasOrderAccess(slug: string, token: string, rawSession: string | undefined) {
  const o = await orderByToken(slug, token);
  if (!o) return null;
  if (lastDigits(o.customerPhone).length < 4) return true;
  if (!rawSession) return false;
  const a = await prisma.orderAccess.findUnique({ where: { sessionHash: sha(rawSession) } });
  return !!a && a.orderId === o.id && a.expiresAt > new Date();
}

/** Confere os dígitos; certo, devolve a sessão (vai para um cookie httpOnly). */
export async function verifyOrderAccess(slug: string, token: string, digits: string, ip: string) {
  const o = await orderByToken(slug, token);
  if (!o) throw new DomainError(404, "Página não encontrada");
  const key = `order:${o.id}`;
  const fails = await prisma.loginAttempt.count({ where: { email: key, success: false, createdAt: { gte: new Date(Date.now() - 15 * 60_000) } } });
  if (fails >= MAX_FAILS) throw new DomainError(429, "Muitas tentativas. Aguarde 15 minutos e tente de novo.");
  const ok = digits.replace(/\D/g, "") === lastDigits(o.customerPhone);
  await prisma.loginAttempt.create({ data: { email: key, ip: sha(ip).slice(0, 32), success: ok } });
  if (!ok) throw new DomainError(401, "Os dígitos não conferem com o telefone cadastrado pela agência.");
  const raw = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCESS_DAYS * 86400_000);
  await prisma.orderAccess.create({ data: { orderId: o.id, sessionHash: sha(raw), expiresAt } });
  return { session: raw, expiresAt };
}

/* ---------------- Pedido visto pelo cliente ---------------- */

/** Só o que interessa ao cliente: sem milhas, custos, orçamento nem anotações internas. */
export async function publicOrder(slug: string, token: string) {
  const o = await prisma.travelOrder.findUnique({
    where: { shareToken: token },
    include: {
      user: { select: { status: true, salesProfile: { select: { slug: true } } } },
      customer: { select: { docNumber: true, docType: true } },
      attachments: { where: { visibleToClient: true }, select: { id: true, name: true }, orderBy: { name: "asc" } },
      signatures: { orderBy: { createdAt: "desc" }, take: 1, select: { name: true, createdAt: true, terms: true } },
    },
  });
  if (!o || o.user.status !== "ACTIVE" || o.user.salesProfile?.slug !== slug.toLowerCase()) return null;
  const proposal: Proposal = resolveProposal(o.proposal);
  const segments = (o.segments as Segment[]).map((s) => ({ origin: s.origin, destination: s.destination, date: s.date ?? null }));
  return {
    userId: o.userId,
    order: {
      number: o.number,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      customerCpf: o.customer?.docType === "CPF" ? o.customer.docNumber : null,
      tripType: o.tripType,
      cabin: o.cabin,
      segments,
      adults: o.adults,
      children: o.children,
      infants: o.infants,
      locator: o.locator,
      clientNotes: o.clientNotes,
      proposal,
      hasProposal: !!o.proposal,
      reservation: resolveReservation(o.reservation) as Reservation,
      files: o.attachments,
      signed: o.signatures[0] ? { name: o.signatures[0].name, at: o.signatures[0].createdAt.toISOString(), terms: o.signatures[0].terms } : null,
    },
  };
}
export type PublicOrder = NonNullable<Awaited<ReturnType<typeof publicOrder>>>["order"];

export async function publicOrderFile(token: string, fileId: string) {
  const f = await prisma.orderAttachment.findFirst({ where: { id: fileId, visibleToClient: true, order: { shareToken: token, user: { status: "ACTIVE" } } } });
  if (!f) throw new DomainError(404, "Arquivo não encontrado");
  return { name: f.name, mime: f.mime, data: Buffer.from(f.data) };
}

/* ---------------- Termo de compra e venda ---------------- */

export { contractText };

export async function signContract(slug: string, token: string, rawSession: string | undefined, input: { name: string; cpf: string; birthDate: string; address: string }, ip: string) {
  if ((await hasOrderAccess(slug, token, rawSession)) !== true) throw new DomainError(403, "Confirme seus dados para assinar");
  const r = await publicOrder(slug, token);
  if (!r) throw new DomainError(404, "Página não encontrada");
  if (r.order.signed) throw new DomainError(409, "Este termo já foi assinado");
  const ipHash = sha(`contract:${ip}`).slice(0, 32);
  if ((await prisma.contractSignature.count({ where: { userId: r.userId, ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= SIGN_PER_HOUR) throw new DomainError(429, "Muitos envios. Tente de novo mais tarde.");
  const b = await ownerBranding(r.userId);
  const order = await prisma.travelOrder.findUniqueOrThrow({ where: { shareToken: token }, select: { id: true } });
  const d = input.cpf.replace(/\D/g, "");
  const cpf = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
  const terms = contractText(b.design.contrato.terms, { name: b.agency, doc: b.design.contrato.agencyDoc, address: b.design.contrato.agencyAddress }, r.order, { ...input, cpf });
  await prisma.contractSignature.create({
    data: { userId: r.userId, orderId: order.id, name: input.name.trim(), cpf: input.cpf.replace(/\D/g, ""), birthDate: input.birthDate, address: input.address.trim(), phone: r.order.customerPhone, terms, ipHash },
  });
  await prisma.notification.create({ data: { userId: r.userId, title: "Termo assinado", body: `${input.name.trim()} assinou o termo do pedido ${r.order.number}.` } });
  return { ok: true };
}

export async function listSignatures(userId: string) {
  const rows = await prisma.contractSignature.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, name: true, email: true, phone: true, createdAt: true, order: { select: { number: true } } } });
  return rows.map((r) => ({ id: r.id, name: r.name, email: r.email, phone: r.phone, orderNumber: r.order?.number ?? null, createdAt: r.createdAt.toISOString() }));
}
