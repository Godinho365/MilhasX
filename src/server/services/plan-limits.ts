import { prisma, DomainError } from "../db";
import { PLANS, PLAN_LIMITS, effectivePlan, type PlanCode } from "@/domain/plans";

type Countable = "holders" | "accounts" | "storeAlerts";
export type Feature = "suppliers" | "holderPage" | "pageBranding";

const LABELS: Record<Countable, [string, string]> = { holders: ["titular", "titulares"], accounts: ["conta", "contas"], storeAlerts: ["alerta de loja", "alertas de loja"] };
const FEATURE_LABELS: Record<Feature, string> = { suppliers: "Fornecedores e emissão com fornecedor", holderPage: "A página do titular", pageBranding: "Cor de fundo, banner e prévia do link" };
const HINT = "Altere o plano em Configurações › Assinatura.";

async function planOf(userId: string): Promise<PlanCode | "ADMIN"> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true, plan: true, trialEndsAt: true } });
  return u.role === "ADMIN" ? "ADMIN" : effectivePlan(u).plan;
}

const count = (userId: string, what: Countable) =>
  what === "holders" ? prisma.holder.count({ where: { userId } })
  : what === "accounts" ? prisma.account.count({ where: { userId } })
  : prisma.alert.count({ where: { userId, type: "STORE_POINTS" } });

/** Barra a criação de mais um item quando o plano em vigor já chegou ao limite. */
export async function assertWithinLimit(userId: string, what: Countable) {
  const plan = await planOf(userId);
  if (plan === "ADMIN") return;
  const max = PLAN_LIMITS[plan][what];
  if (max === null || (await count(userId, what)) < max) return;
  const [one, many] = LABELS[what];
  throw new DomainError(402, `Seu plano ${PLANS[plan].name} permite até ${max} ${max === 1 ? one : many}. ${HINT}`);
}

/** Barra recursos exclusivos de planos superiores. */
export async function assertFeature(userId: string, feature: Feature) {
  const plan = await planOf(userId);
  if (plan === "ADMIN" || PLAN_LIMITS[plan][feature]) return;
  const from = (Object.keys(PLAN_LIMITS) as PlanCode[]).find((k) => PLAN_LIMITS[k][feature]) ?? "GESTOR";
  throw new DomainError(402, `${FEATURE_LABELS[feature]} faz parte do plano ${PLANS[from].name}. ${HINT}`);
}

/** Mesmo critério de assertFeature, para a interface saber o que mostrar liberado. */
export async function hasFeature(userId: string, feature: Feature) {
  const plan = await planOf(userId);
  return plan === "ADMIN" || PLAN_LIMITS[plan][feature];
}
