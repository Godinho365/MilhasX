// Cupons de desconto (checkout do Mercado Pago) e convites com plano ou teste (link /convite/CODIGO).
import { Prisma, type Plan } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import {
  checkCoupon, inviteEffect, inviteLabel, inviteState, normalizeCode, validateCouponInput, validateInviteInput,
  type CouponInput, type InviteInput,
} from "@/domain/promo";
import type { PlanCode, PlanInterval } from "@/domain/plans";

// ---------- Cupons ----------

/** Usos de um cupom = assinaturas pagas (autorizadas) com ele. */
const couponUses = (couponId: string, db: Prisma.TransactionClient | typeof prisma = prisma) =>
  db.subscription.count({ where: { couponId, status: "AUTHORIZED" } });

export async function listCoupons() {
  const [coupons, uses] = await Promise.all([
    prisma.coupon.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    prisma.subscription.groupBy({ by: ["couponId", "status"], where: { couponId: { not: null } }, _count: true, _sum: { discountCents: true } }),
  ]);
  return coupons.map((c) => {
    const mine = uses.filter((u) => u.couponId === c.id);
    const paid = mine.find((u) => u.status === "AUTHORIZED");
    return {
      ...c,
      uses: paid?._count ?? 0,
      started: mine.reduce((t, u) => t + u._count, 0),
      discountMonthCents: paid?._sum.discountCents ?? 0,
    };
  });
}

export async function saveCoupon(actorId: string, id: string | null, input: CouponInput) {
  const err = validateCouponInput(input);
  if (err) throw new DomainError(400, err);
  const code = normalizeCode(input.code);
  const data = { ...input, code, note: input.note?.trim() || null };
  try {
    const c = id ? await prisma.coupon.update({ where: { id }, data }) : await prisma.coupon.create({ data: { ...data, createdById: actorId } });
    await audit(prisma, actorId, id ? "admin.coupon_update" : "admin.coupon_create", "Coupon", c.id, { code, kind: c.kind, value: c.value });
    return c;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError(409, "Já existe um cupom com esse código");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw new DomainError(404, "Cupom não encontrado");
    throw e;
  }
}

export async function setCouponActive(actorId: string, id: string, active: boolean) {
  const c = await prisma.coupon.update({ where: { id }, data: { active } }).catch(() => null);
  if (!c) throw new DomainError(404, "Cupom não encontrado");
  await audit(prisma, actorId, active ? "admin.coupon_enable" : "admin.coupon_disable", "Coupon", id, { code: c.code });
}

/** Confere um cupom para o plano escolhido (prévia na tela de assinatura e no checkout). */
export async function quoteCoupon(rawCode: string, plan: PlanCode, interval: PlanInterval, baseCents: number, now = new Date()) {
  const code = normalizeCode(rawCode);
  const c = code ? await prisma.coupon.findUnique({ where: { code } }) : null;
  const r = checkCoupon(c, plan, interval, baseCents, c ? await couponUses(c.id) : 0, now);
  return { coupon: c, check: r };
}

// ---------- Convites ----------

export async function listInvites() {
  const now = new Date();
  const invites = await prisma.planInvite.findMany({
    include: { redemptions: { include: { user: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } } },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
  return invites.map((i) => ({ ...i, plan: i.plan as PlanCode | null, uses: i.redemptions.length, state: inviteState({ ...i, plan: i.plan as PlanCode | null }, i.redemptions.length, now), label: inviteLabel({ ...i, plan: i.plan as PlanCode | null }) }));
}

export async function saveInvite(actorId: string, id: string | null, input: InviteInput) {
  const err = validateInviteInput(input);
  if (err) throw new DomainError(400, err);
  const code = normalizeCode(input.code);
  const data = {
    code, kind: input.kind, maxUses: input.maxUses, expiresAt: input.expiresAt, note: input.note?.trim() || null,
    plan: input.kind === "PLAN" ? (input.plan as Plan) : null,
    interval: input.kind === "PLAN" ? input.interval ?? "MENSAL" : null,
    days: input.kind === "TRIAL" ? input.days : null,
  };
  try {
    const i = id ? await prisma.planInvite.update({ where: { id }, data }) : await prisma.planInvite.create({ data: { ...data, createdById: actorId } });
    await audit(prisma, actorId, id ? "admin.invite_update" : "admin.invite_create", "PlanInvite", i.id, { code, kind: i.kind });
    return i;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new DomainError(409, "Já existe um convite com esse código");
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025") throw new DomainError(404, "Convite não encontrado");
    throw e;
  }
}

export async function setInviteActive(actorId: string, id: string, active: boolean) {
  const i = await prisma.planInvite.update({ where: { id }, data: { active } }).catch(() => null);
  if (!i) throw new DomainError(404, "Convite não encontrado");
  await audit(prisma, actorId, active ? "admin.invite_enable" : "admin.invite_disable", "PlanInvite", id, { code: i.code });
}

/** O que a página pública do convite mostra (sem dados de quem já usou). */
export async function publicInvite(rawCode: string) {
  const code = normalizeCode(rawCode);
  const i = code ? await prisma.planInvite.findUnique({ where: { code }, include: { _count: { select: { redemptions: true } } } }) : null;
  if (!i) return null;
  const rule = { ...i, plan: i.plan as PlanCode | null };
  return { code: i.code, label: inviteLabel(rule), state: inviteState(rule, i._count.redemptions), kind: i.kind, days: i.days, plan: rule.plan };
}

/** Usa o convite na conta (uma vez por pessoa). A linha do convite fica travada para o limite de usos valer. */
export async function redeemInvite(userId: string, rawCode: string, now = new Date()) {
  const code = normalizeCode(rawCode);
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "PlanInvite" WHERE code = ${code} FOR UPDATE`;
    if (!rows[0]) throw new DomainError(404, "Convite não encontrado");
    const inv = await tx.planInvite.findUniqueOrThrow({ where: { id: rows[0].id } });
    const rule = { ...inv, plan: inv.plan as PlanCode | null };
    const uses = await tx.planInviteRedemption.count({ where: { inviteId: inv.id } });
    if (await tx.planInviteRedemption.findUnique({ where: { inviteId_userId: { inviteId: inv.id, userId } } })) throw new DomainError(409, "Você já usou este convite");
    const state = inviteState(rule, uses, now);
    if (state !== "active") throw new DomainError(410, state === "expired" ? "Este convite expirou" : state === "full" ? "Este convite já foi usado o máximo de vezes" : "Este convite não está ativo");
    const u = await tx.user.findUnique({ where: { id: userId }, select: { plan: true, trialEndsAt: true } });
    if (!u) throw new DomainError(404, "Usuário não encontrado");
    const eff = inviteEffect(rule, { plan: u.plan as PlanCode, trialEndsAt: u.trialEndsAt }, now);
    if (!eff.ok) throw new DomainError(409, eff.error);
    await tx.user.update({ where: { id: userId }, data: { ...eff.data, ...("plan" in eff.data ? { planRequest: null, planRequestInterval: null, planRequestedAt: null } : {}) } });
    await tx.planInviteRedemption.create({ data: { inviteId: inv.id, userId } });
    const label = inviteLabel(rule);
    await tx.notification.create({ data: { userId, category: "billing", title: "Convite aplicado", body: `Você ganhou: ${label}.` } });
    await audit(tx, userId, "billing.invite_redeem", "PlanInvite", inv.id, { code, kind: inv.kind });
    return { label };
  });
}

/** Quem está num plano pago por convite de cortesia (fica fora do MRR). */
export async function courtesyUserIds() {
  const rows = await prisma.planInviteRedemption.findMany({ where: { invite: { kind: "PLAN" } }, select: { userId: true } });
  return new Set(rows.map((r) => r.userId));
}
