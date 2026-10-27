import { randomBytes } from "node:crypto";
import type { Plan, Prisma } from "@prisma/client";
import { prisma, DomainError, audit } from "../db";
import { mpEnabled, currentSubscription } from "./billing-mp";
import { assertFeature, hasFeature } from "./plan-limits";
import { detectImage } from "./extras";
import { resolveDesign, type PageDesign } from "@/domain/page-design";
import { PLANS, effectivePlan, planPriceCents, notifyPrefs, REFERRAL_TRIAL_DAYS, TRIAL_DAYS, type PlanCode, type PlanInterval, type ValuesMode } from "@/domain/plans";

// ---------- Preferências (aba Geral) ----------

export interface PreferenceInput {
  showValues?: boolean;
  checklistHidden?: boolean;
  dashboardView?: "visao-geral" | "vendas" | "gestao";
  soundEffects?: boolean;
  usageAnalytics?: boolean;
  hideVideoTutorials?: boolean;
  valuesMode?: ValuesMode;
  notifications?: Record<string, { email?: boolean; push?: boolean }>;
}

export async function savePreferences(userId: string, input: PreferenceInput) {
  const data: Prisma.UserPreferenceUpdateInput = { ...input, notifications: undefined };
  // "Mostrar valores" e o modo de visibilidade andam juntos
  if (input.valuesMode) data.showValues = input.valuesMode === "VISIBLE";
  else if (input.showValues !== undefined) data.valuesMode = input.showValues ? "VISIBLE" : "PARTIAL";
  if (input.notifications) {
    const cur = await prisma.userPreference.findUnique({ where: { userId }, select: { notifications: true } });
    const merged = notifyPrefs(cur?.notifications);
    for (const [k, v] of Object.entries(input.notifications)) {
      if (!(k in merged)) continue;
      const m = merged[k as keyof typeof merged];
      if (v.email !== undefined) m.email = v.email;
      if (v.push !== undefined) m.push = v.push;
    }
    data.notifications = merged;
  }
  return prisma.userPreference.upsert({
    where: { userId },
    update: data,
    create: { userId, ...(data as Prisma.UserPreferenceCreateWithoutUserInput) },
  });
}

export async function getPreferences(userId: string) {
  const p = await prisma.userPreference.findUnique({ where: { userId } });
  return {
    showValues: p?.showValues !== false,
    checklistHidden: !!p?.checklistHidden,
    soundEffects: p?.soundEffects !== false,
    usageAnalytics: p?.usageAnalytics !== false,
    hideVideoTutorials: !!p?.hideVideoTutorials,
    valuesMode: ((["VISIBLE", "PARTIAL", "HIDDEN"] as const).find((m) => m === p?.valuesMode) ?? (p?.showValues === false ? "PARTIAL" : "VISIBLE")) as ValuesMode,
    notifications: notifyPrefs(p?.notifications),
  };
}

// ---------- Perfil ----------

export async function updateProfile(userId: string, name: string) {
  await prisma.user.update({ where: { id: userId }, data: { name: name.trim() } });
}

/** Pedido de exclusão (LGPD): a conta segue ativa até a administração concluir. */
export async function requestDeletion(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: new Date() } });
  await audit(prisma, userId, "user.deletion_request", "User", userId);
}
export async function cancelDeletion(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { deletionRequestedAt: null } });
  await audit(prisma, userId, "user.deletion_cancel", "User", userId);
}

// ---------- Assinatura ----------

export async function billingState(userId: string) {
  const u = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { plan: true, planInterval: true, trialEndsAt: true, planRequest: true, planRequestInterval: true, planRequestedAt: true },
  });
  const eff = effectivePlan(u);
  const interval = (u.planInterval as PlanInterval | null) ?? "MENSAL";
  return {
    plan: u.plan as PlanCode,
    effective: eff.plan,
    trialDaysLeft: eff.trialDaysLeft,
    trialEndsAt: u.trialEndsAt?.toISOString() ?? null,
    interval,
    monthlyCents: planPriceCents(u.plan as PlanCode, interval),
    request: u.planRequest ? { plan: u.planRequest as PlanCode, interval: (u.planRequestInterval as PlanInterval) ?? "MENSAL", at: u.planRequestedAt!.toISOString() } : null,
    online: mpEnabled(),
    subscription: await currentSubscription(userId),
  };
}

/** O usuário só pede a troca; quem ativa é a administração (ninguém se promove por requisição). */
export async function requestPlan(userId: string, plan: PlanCode, interval: PlanInterval) {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { plan: true, planInterval: true } });
  if (u.plan === plan && (plan === "PESSOAL" || u.planInterval === interval)) throw new DomainError(400, "Esse já é o seu plano");
  await prisma.user.update({ where: { id: userId }, data: { planRequest: plan, planRequestInterval: plan === "PESSOAL" ? null : interval, planRequestedAt: new Date() } });
  await audit(prisma, userId, "billing.plan_request", "User", userId, { plan, interval });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN", status: "ACTIVE" }, select: { id: true } });
  if (admins.length) {
    await prisma.notification.createMany({
      data: admins.map((a) => ({ userId: a.id, title: "Pedido de plano", body: `Um usuário pediu o plano ${PLANS[plan].name} (${interval === "ANUAL" ? "anual" : "mensal"}).` })),
    });
  }
}
export async function cancelPlanRequest(userId: string) {
  await prisma.user.update({ where: { id: userId }, data: { planRequest: null, planRequestInterval: null, planRequestedAt: null } });
}

/** Ativação manual pelo administrador (sem cobrança). */
export async function adminSetPlan(actorId: string, userId: string, plan: Plan, interval: PlanInterval | null) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!u) throw new DomainError(404, "Usuário não encontrado");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { plan, planInterval: plan === "PESSOAL" ? null : interval ?? "MENSAL", planRequest: null, planRequestInterval: null, planRequestedAt: null },
    });
    await tx.notification.create({ data: { userId, title: "Plano atualizado", body: `Seu plano agora é ${PLANS[plan].name}.` } });
    await audit(tx, actorId, "admin.user_plan", "User", userId, { plan, interval });
  });
}

// ---------- Indicações ----------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function newCode() {
  const b = randomBytes(8);
  return Array.from(b, (x) => CODE_ALPHABET[x % CODE_ALPHABET.length]).join("");
}

export async function referralState(userId: string) {
  let u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { referralCode: true } });
  for (let i = 0; !u.referralCode && i < 5; i++) {
    try {
      u = await prisma.user.update({ where: { id: userId }, data: { referralCode: newCode() }, select: { referralCode: true } });
    } catch {
      // colisão de código: tenta outro
    }
  }
  // Só o primeiro nome e a data de quem foi indicado (sem e-mail)
  const referred = await prisma.user.findMany({ where: { referredById: userId }, select: { name: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return {
    code: u.referralCode!,
    referred: referred.map((r) => ({ name: r.name.split(" ")[0]!, createdAt: r.createdAt.toISOString() })),
    creditMonths: referred.length,
  };
}

/** Dias de teste e quem indicou, a partir do código usado no cadastro. */
export async function signupReferral(code: string | undefined | null) {
  const c = code?.trim().toUpperCase();
  const ref = c ? await prisma.user.findUnique({ where: { referralCode: c }, select: { id: true } }) : null;
  const days = ref ? REFERRAL_TRIAL_DAYS : TRIAL_DAYS;
  return { referredById: ref?.id ?? null, trialEndsAt: new Date(Date.now() + days * 86400_000) };
}

// ---------- Perfil público de vendas ----------

export interface SalesProfileInput {
  slug: string;
  displayName: string;
  bio?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  email?: string | null;
  programIds: string[];
  published: boolean;
  acceptsOrders?: boolean;
  acceptsLeads?: boolean;
  headline?: string | null;
  design?: unknown;
}

/** Sem os bytes do banner: o editor só precisa saber se existe (bannerUpdatedAt). */
export async function getSalesProfile(userId: string) {
  return prisma.salesProfile.findUnique({ where: { userId }, omit: { banner: true } });
}

const brandingKey = (d: PageDesign) => JSON.stringify([d.bgColor, d.share]);

export async function saveSalesProfile(userId: string, input: SalesProfileInput) {
  const slug = input.slug.trim().toLowerCase();
  const taken = await prisma.salesProfile.findFirst({ where: { slug, NOT: { userId } }, select: { userId: true } });
  if (taken) throw new DomainError(409, "Esse endereço já está em uso");
  const programs = await prisma.program.findMany({ where: { id: { in: input.programIds }, active: true }, select: { id: true } });
  const saved = await prisma.salesProfile.findUnique({ where: { userId }, select: { design: true } });
  const design = resolveDesign(input.design === undefined ? saved?.design : input.design);
  // Cor de fundo e prévia do link são do plano PRO; manter o que já estava salvo é sempre permitido
  if (brandingKey(design) !== brandingKey(resolveDesign(saved?.design))) await assertFeature(userId, "pageBranding");
  const data = {
    slug,
    displayName: input.displayName.trim(),
    bio: input.bio?.trim() || null,
    whatsapp: input.whatsapp?.replace(/\D/g, "") || null,
    instagram: input.instagram?.trim().replace(/^@/, "") || null,
    email: input.email?.trim() || null,
    programIds: programs.map((p) => p.id),
    published: input.published,
    acceptsOrders: input.acceptsOrders ?? true,
    acceptsLeads: input.acceptsLeads ?? true,
    headline: input.headline?.trim() || null,
    design: design as unknown as Prisma.InputJsonValue,
  };
  return prisma.salesProfile.upsert({ where: { userId }, update: data, create: { userId, ...data }, omit: { banner: true } });
}

/** Configurações › Sua MilhasX: só ativar/desativar e o endereço (o resto fica no editor). */
export async function setSalesProfilePublication(userId: string, defaultName: string, input: { published: boolean; slug: string }) {
  const slug = input.slug.trim().toLowerCase();
  const taken = await prisma.salesProfile.findFirst({ where: { slug, NOT: { userId } }, select: { userId: true } });
  if (taken) throw new DomainError(409, "Esse endereço já está em uso");
  return prisma.salesProfile.upsert({
    where: { userId },
    update: { slug, published: input.published },
    create: { userId, slug, published: input.published, displayName: defaultName, programIds: [], design: resolveDesign(null) as unknown as Prisma.InputJsonValue },
    omit: { banner: true },
  });
}

/** Página pública: só perfis publicados e só os campos que o próprio usuário escolheu mostrar. */
export async function publicSalesProfile(slug: string) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, omit: { banner: true } });
  if (!p || !p.published) return null;
  const owner = await prisma.user.findUnique({ where: { id: p.userId }, select: { status: true } });
  if (owner?.status !== "ACTIVE") return null;
  const programs = await prisma.program.findMany({ where: { id: { in: p.programIds } }, select: { id: true, name: true, color: true }, orderBy: { name: "asc" } });
  const design = resolveDesign(p.design);
  // Se o plano deixou de incluir a personalização PRO, a página volta ao visual padrão
  const branded = await hasFeature(p.userId, "pageBranding");
  if (!branded) Object.assign(design, { bgColor: null, share: { title: "", description: "" } });
  const bannerVersion = branded && p.bannerUpdatedAt ? String(p.bannerUpdatedAt.getTime()) : null;
  return { slug: p.slug, displayName: p.displayName, bio: p.bio, whatsapp: p.whatsapp, instagram: p.instagram, email: p.email, acceptsOrders: p.acceptsOrders, acceptsLeads: p.acceptsLeads, headline: p.headline, programs, design, bannerVersion };
}

// ---------- Banner no topo da página (PRO) ----------

const MAX_BANNER = 1024 * 1024;

export async function setBanner(userId: string, buf: Buffer) {
  await assertFeature(userId, "pageBranding");
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_BANNER) throw new DomainError(413, "Imagem maior que 1 MB");
  const mime = detectImage(buf);
  if (!mime) throw new DomainError(415, "Envie uma imagem JPG, PNG ou WebP");
  const r = await prisma.salesProfile.updateMany({ where: { userId }, data: { banner: new Uint8Array(buf), bannerMime: mime, bannerUpdatedAt: new Date() } });
  if (r.count === 0) throw new DomainError(400, "Salve a página uma vez antes de enviar o banner");
}

export async function removeBanner(userId: string) {
  await prisma.salesProfile.updateMany({ where: { userId }, data: { banner: null, bannerMime: null, bannerUpdatedAt: null } });
}

/** Banner da página publicada (o dono vê o próprio mesmo sem publicar, para a prévia). */
export async function getBanner(slug: string, viewerId: string | null) {
  const p = await prisma.salesProfile.findUnique({ where: { slug: slug.toLowerCase() }, select: { userId: true, published: true, banner: true, bannerMime: true } });
  if (!p?.banner || !p.bannerMime) return null;
  if (p.userId !== viewerId && (!p.published || !(await hasFeature(p.userId, "pageBranding")))) return null;
  return { data: Buffer.from(p.banner), mime: p.bannerMime };
}
