// Planos do Milheiro. Não há cobrança real: a troca de plano é um pedido que a administração ativa.
export type PlanCode = "PESSOAL" | "PRO" | "GESTOR";
export type PlanInterval = "MENSAL" | "ANUAL";

export const TRIAL_DAYS = 15;
export const REFERRAL_TRIAL_DAYS = 30;
export const ANNUAL_DISCOUNT_PCT = 16;

export const PLANS: Record<PlanCode, { name: string; monthlyCents: number; tagline: string; features: string[] }> = {
  PESSOAL: {
    name: "Pessoal",
    monthlyCents: 0,
    tagline: "Para organizar os seus próprios pontos",
    features: ["Até 5 contas em programas", "1 titular", "Extrato e relatórios", "Simuladores básicos", "Alertas de lojas (até 3)"],
  },
  PRO: {
    name: "PRO",
    monthlyCents: 19_90,
    tagline: "Para quem acumula com estratégia",
    features: [
      "Tudo do Pessoal",
      "Contas e compras ilimitadas",
      "Até 2 titulares",
      "Simulador de vendas",
      "Comprovantes e limite de CPFs",
      "Alertas de lojas ilimitados",
      "Alertas de promoções em tempo real",
      "Evolução e anexos",
    ],
  },
  GESTOR: {
    name: "Gestor",
    monthlyCents: 39_90,
    tagline: "Para quem gerencia contas de terceiros e vende emissões",
    features: [
      "Tudo do PRO",
      "Clientes ilimitados",
      "Contas de clientes e fornecedores",
      "Emissão com fornecedores",
      "Comparação de fornecedores",
      "Visão consolidada",
      "Página do titular",
    ],
  },
};

/** Preço por mês no intervalo escolhido (o anual tem desconto). */
export function planPriceCents(plan: PlanCode, interval: PlanInterval) {
  const m = PLANS[plan].monthlyCents;
  return interval === "ANUAL" ? Math.round((m * (100 - ANNUAL_DISCOUNT_PCT)) / 100) : m;
}

/** Plano em vigor: durante o teste o usuário usa o Gestor. */
export function effectivePlan(u: { plan: PlanCode; trialEndsAt: Date | null }, now = new Date()): { plan: PlanCode; trialDaysLeft: number } {
  if (u.plan === "PESSOAL" && u.trialEndsAt && u.trialEndsAt > now) {
    return { plan: "GESTOR", trialDaysLeft: Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / 86400_000) };
  }
  return { plan: u.plan, trialDaysLeft: 0 };
}

export const VALUES_MODES = ["VISIBLE", "PARTIAL", "HIDDEN"] as const;
export type ValuesMode = (typeof VALUES_MODES)[number];
export const VALUES_LABELS: Record<ValuesMode, string> = { VISIBLE: "Visível", PARTIAL: "Parcial", HIDDEN: "Oculto" };

// Canais de notificação por categoria (o push fica guardado como preferência; não há envio de push local)
export const NOTIFY_CATEGORIES = [
  ["points", "Alertas de pontuação", "Quando uma loja atingir os pontos do seu alerta"],
  ["offers", "Alertas de ofertas", "Promoções de transferência e compra de pontos"],
  ["entries", "Lançamentos", "Recorrências geradas e pontos a receber"],
  ["marketing", "Marketing", "Novidades e dicas do Milheiro"],
  ["system", "Sistema", "Avisos importantes sobre a sua conta"],
  ["billing", "Assinatura", "Teste, plano e renovação"],
] as const;
export type NotifyCategory = (typeof NOTIFY_CATEGORIES)[number][0];
export type NotifyPrefs = Record<NotifyCategory, { email: boolean; push: boolean }>;

export function notifyPrefs(raw: unknown): NotifyPrefs {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, { email?: unknown; push?: unknown }>;
  return Object.fromEntries(
    // Por padrão tudo vai por e-mail, menos marketing (só com opt-in)
    NOTIFY_CATEGORIES.map(([k]) => [k, { email: o[k]?.email === undefined ? k !== "marketing" : o[k]?.email === true, push: o[k]?.push === true }]),
  ) as NotifyPrefs;
}

// Limites de cada plano (tirados das listas de recursos acima). null = sem limite.
export type PlanLimits = { holders: number | null; accounts: number | null; storeAlerts: number | null; suppliers: boolean; holderPage: boolean };
export const PLAN_LIMITS: Record<PlanCode, PlanLimits> = {
  PESSOAL: { holders: 1, accounts: 5, storeAlerts: 3, suppliers: false, holderPage: false },
  PRO: { holders: 2, accounts: null, storeAlerts: null, suppliers: false, holderPage: false },
  GESTOR: { holders: null, accounts: null, storeAlerts: null, suppliers: true, holderPage: true },
};
