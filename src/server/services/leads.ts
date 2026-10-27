import { createHash } from "node:crypto";
import { prisma, DomainError } from "../db";

// Interessados em gestão de milhas, vindos da Central de Atendimento (página pública).
export const LEAD_STATUS = { NEW: "Novo", CONTACTED: "Em contato", CLIENT: "Virou cliente", DISCARDED: "Descartado" } as const;
export type LeadStatus = keyof typeof LEAD_STATUS;
const PER_HOUR = 5;

export async function createPublicLead(slug: string, input: { name: string; phone?: string | null; email?: string | null; message?: string | null }, ip: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, published: true, acceptsLeads: true, user: { select: { status: true } } } });
  if (!p || !p.published || !p.acceptsLeads || p.user.status !== "ACTIVE") throw new DomainError(404, "Página não encontrada");
  if (!input.phone?.trim() && !input.email?.trim()) throw new DomainError(400, "Informe um telefone ou e-mail para contato");
  const ipHash = createHash("sha256").update(`lead:${slug}:${ip}`).digest("hex").slice(0, 32);
  if ((await prisma.milesLead.count({ where: { userId: p.userId, ipHash, createdAt: { gte: new Date(Date.now() - 3600_000) } } })) >= PER_HOUR) throw new DomainError(429, "Muitos envios. Tente de novo mais tarde.");
  const lead = await prisma.milesLead.create({
    data: { userId: p.userId, name: input.name.trim(), phone: input.phone?.trim() || null, email: input.email?.trim() || null, message: input.message?.trim() || null, ipHash },
  });
  await prisma.notification.create({ data: { userId: p.userId, title: "Novo interesse em Gestão de Milhas", body: `${lead.name} manifestou interesse no serviço de gestão de milhas.` } });
  return { ok: true };
}

export async function listLeads(userId: string) {
  const rows = await prisma.milesLead.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 200 });
  return rows.map((l) => ({ id: l.id, name: l.name, phone: l.phone, email: l.email, message: l.message, status: l.status as LeadStatus, createdAt: l.createdAt.toISOString() }));
}

export async function setLeadStatus(userId: string, id: string, status: LeadStatus) {
  const { count } = await prisma.milesLead.updateMany({ where: { id, userId }, data: { status } });
  if (!count) throw new DomainError(404, "Interessado não encontrado");
}

export async function deleteLead(userId: string, id: string) {
  const { count } = await prisma.milesLead.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Interessado não encontrado");
}
