// Indicadores da administração (Admin › Indicadores): contas puras sobre os dados já carregados.
// O serviço server/services/admin-dashboard.ts busca no banco e chama estas funções.
import { brDay } from "./brasilia";
import { planPriceCents, type PlanCode, type PlanInterval } from "./plans";

const DAY = 86_400_000;

export const PERIODS = [
  { key: "7d", label: "7 dias", days: 7 },
  { key: "30d", label: "30 dias", days: 30 },
  { key: "90d", label: "90 dias", days: 90 },
  { key: "12m", label: "12 meses", days: 365 },
] as const;
type PresetKey = (typeof PERIODS)[number]["key"];
/** Período do admin na URL (?p=): os últimos N dias, "all" (todo o período) ou dias escolhidos no calendário ("AAAA-MM-DD_AAAA-MM-DD", horário de Brasília). */
export type PeriodKey = PresetKey | "all" | `${string}_${string}`;
export type Bucket = "day" | "week" | "month";

const RANGE_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/;
const validDay = (d: string) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
/** Começo do histórico do MilhasX: "todo o período" parte daqui. */
export const ALL_FROM_DAY = "2024-01-01";

export function parsePeriod(v: string | undefined | null): PeriodKey {
  if (PERIODS.some((p) => p.key === v)) return v as PresetKey;
  if (v === "all") return "all";
  const m = v ? RANGE_RE.exec(v) : null;
  if (m && validDay(m[1]!) && validDay(m[2]!) && m[1]! <= m[2]!) return v as PeriodKey;
  return "30d";
}

export type PeriodWindow = { key: PeriodKey; label: string; phrase: string; days: number; from: Date; to: Date; prevFrom: Date; prevTo: Date; bucket: Bucket };

const brMidnight = (day: string) => new Date(`${day}T00:00:00-03:00`); // Brasília não tem horário de verão desde 2019
const nextDay = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) + DAY).toISOString().slice(0, 10);
const MONTH_NAMES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Nome do período escolhido no calendário: "novembro de 2026", "14/11/2026" ou "01/11 a 14/11/2026". */
export function rangeText(from: string, to: string) {
  const lastOfMonth = new Date(Date.parse(`${nextDay(to)}T00:00:00Z`)).getUTCDate() === 1;
  if (from.slice(0, 7) === to.slice(0, 7) && from.endsWith("-01") && lastOfMonth) return `${MONTH_NAMES[Number(from.slice(5, 7)) - 1]} de ${from.slice(0, 4)}`;
  if (from === to) return `${ddmm(from)}/${from.slice(0, 4)}`;
  return `${ddmm(from)}${from.slice(0, 4) === to.slice(0, 4) ? "" : `/${from.slice(0, 4)}`} a ${ddmm(to)}/${to.slice(0, 4)}`;
}

const bucketOf = (days: number): Bucket => (days <= 31 ? "day" : days <= 92 ? "week" : "month");

/**
 * Janela do período e o período anterior de mesmo tamanho (para as comparações).
 * `label` é o nome ("últimos 30 dias", "novembro de 2026", "todo o período") e `phrase` já vem com a preposição
 * ("nos últimos 30 dias", "em novembro de 2026", "de 01/11 a 14/11/2026").
 */
export function periodWindow(key: PeriodKey, now = new Date()): PeriodWindow {
  const preset = PERIODS.find((x) => x.key === key);
  if (preset) {
    const from = new Date(now.getTime() - preset.days * DAY);
    return { key, label: `últimos ${preset.label}`, phrase: `nos últimos ${preset.label}`, days: preset.days, from, to: now, prevFrom: new Date(from.getTime() - preset.days * DAY), prevTo: from, bucket: bucketOf(preset.days) };
  }
  const m = key === "all" ? null : RANGE_RE.exec(key);
  const fromDay = m ? m[1]! : ALL_FROM_DAY;
  const from = brMidnight(fromDay);
  const end = m ? brMidnight(nextDay(m[2]!)) : now;
  const to = end > now && now > from ? now : end; // "este mês" vai até agora
  const days = Math.max(1, Math.round((end.getTime() - from.getTime()) / DAY));
  const span = to.getTime() - from.getTime();
  const label = m ? rangeText(m[1]!, m[2]!) : "todo o período";
  return {
    key, label, phrase: m && m[1] !== m[2] && !/ de \d{4}$/.test(label) ? `de ${label}` : `em ${label}`, days, from, to,
    prevFrom: m ? new Date(from.getTime() - span) : from, prevTo: from,
    bucket: bucketOf(Math.ceil(span / DAY)),
  };
}

/** Dias (AAAA-MM-DD) do período para o seletor de calendário; null = todo o período. */
export function periodDays(key: PeriodKey, now = new Date()): { from: string; to: string } | null {
  if (key === "all") return null;
  const m = RANGE_RE.exec(key);
  if (m) return { from: m[1]!, to: m[2]! };
  const days = PERIODS.find((x) => x.key === key)!.days;
  return { from: brDay(new Date(now.getTime() - (days - 1) * DAY)), to: brDay(now) };
}

export const inRange = (d: Date | null | undefined, from: Date, to: Date) => !!d && d >= from && d < to;

/** Variação percentual em relação ao período anterior (null quando não há base). */
export function delta(cur: number, prev: number): { pct: number | null; dir: "up" | "down" | "flat" } {
  const dir = cur > prev ? "up" : cur < prev ? "down" : "flat";
  if (prev === 0) return { pct: cur === 0 ? 0 : null, dir };
  return { pct: Math.round(((cur - prev) / prev) * 1000) / 10, dir };
}

/** Chave do balde (dia, segunda-feira da semana ou 1º do mês) no horário de Brasília. */
export function bucketKey(d: Date, bucket: Bucket) {
  const day = brDay(d);
  if (bucket === "day") return day;
  if (bucket === "month") return `${day.slice(0, 7)}-01`;
  const t = new Date(`${day}T00:00:00Z`);
  return new Date(t.getTime() - ((t.getUTCDay() + 6) % 7) * DAY).toISOString().slice(0, 10);
}

/** Todas as chaves do período, em ordem, para o gráfico não pular dias sem movimento. */
export function bucketKeys(w: Pick<PeriodWindow, "from" | "to" | "bucket">) {
  const keys: string[] = [];
  for (let t = w.from.getTime(); t < w.to.getTime() + DAY; t += DAY) {
    const k = bucketKey(new Date(Math.min(t, w.to.getTime())), w.bucket);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return keys;
}

/** Série de contagens por balde; cada série recebe as datas (ou pares usuário+dia, contados uma vez). */
export function seriesByBucket(w: PeriodWindow, series: Record<string, { at: Date; id?: string }[]>) {
  const keys = bucketKeys(w);
  const rows = keys.map((k) => ({ day: k, ...Object.fromEntries(Object.keys(series).map((s) => [s, 0])) }) as Record<string, number | string>);
  const idx = new Map(keys.map((k, i) => [k, i]));
  for (const [name, items] of Object.entries(series)) {
    const seen = new Set<string>();
    for (const it of items) {
      if (!inRange(it.at, w.from, w.to)) continue;
      const k = bucketKey(it.at, w.bucket);
      const i = idx.get(k);
      if (i === undefined) continue;
      if (it.id) {
        const u = `${k}|${it.id}`;
        if (seen.has(u)) continue;
        seen.add(u);
      }
      rows[i]![name] = Number(rows[i]![name]) + 1;
    }
  }
  return rows;
}

// ---------- Receita ----------

export type AdminUser = {
  id: string;
  plan: PlanCode;
  planInterval: string | null;
  trialEndsAt: Date | null;
  createdAt: Date;
  planRequest: PlanCode | null;
  planRequestedAt: Date | null;
  deletionRequestedAt: Date | null;
  status: string;
};
export type AdminSub = { id: string; userId: string; plan: PlanCode; interval: string; amountCents: number; status: string; createdAt: Date; updatedAt: Date };

const months = (interval: string | null) => (interval === "ANUAL" ? 12 : 1);
const isPaidPlan = (p: PlanCode) => p !== "PESSOAL";

/**
 * Receita recorrente mensal. Quem tem assinatura autorizada no Mercado Pago entra pelo valor cobrado
 * (o anual dividido por 12); quem foi ativado pela administração entra pelo preço de tabela.
 */
export function revenue(users: AdminUser[], subs: AdminSub[], courtesy: Set<string> = new Set()) {
  const authorized = new Map<string, AdminSub>();
  for (const s of subs) if (s.status === "AUTHORIZED" && (!authorized.has(s.userId) || authorized.get(s.userId)!.createdAt < s.createdAt)) authorized.set(s.userId, s);
  let paidCents = 0, manualCents = 0, courtesyCount = 0;
  const byPlan: Record<string, { count: number; mrrCents: number }> = {};
  for (const u of users) {
    if (!isPaidPlan(u.plan) || u.status !== "ACTIVE") continue;
    const sub = authorized.get(u.id);
    // Plano de cortesia (convite) sem assinatura: não é receita
    if (!sub && courtesy.has(u.id)) {
      courtesyCount++;
      continue;
    }
    const mrr = sub ? Math.round(sub.amountCents / months(sub.interval)) : planPriceCents(u.plan, (u.planInterval ?? "MENSAL") as PlanInterval);
    if (sub) paidCents += mrr;
    else manualCents += mrr;
    const k = `${u.plan}|${u.planInterval === "ANUAL" ? "ANUAL" : "MENSAL"}`;
    byPlan[k] ??= { count: 0, mrrCents: 0 };
    byPlan[k].count++;
    byPlan[k].mrrCents += mrr;
  }
  const mrrCents = paidCents + manualCents;
  const payers = Object.values(byPlan).reduce((t, p) => t + p.count, 0);
  return { mrrCents, arrCents: mrrCents * 12, paidCents, manualCents, payers, courtesy: courtesyCount, arpuCents: payers ? Math.round(mrrCents / payers) : 0, byPlan };
}

/** Saídas no período: assinaturas canceladas/pausadas e rebaixamentos feitos pela administração. */
export function churn(subs: AdminSub[], downgrades: { userId: string; at: Date }[], from: Date, to: Date, payersNow: number) {
  const users = new Set<string>();
  for (const s of subs) if ((s.status === "CANCELLED" || s.status === "PAUSED") && inRange(s.updatedAt, from, to)) users.add(s.userId);
  for (const d of downgrades) if (inRange(d.at, from, to)) users.add(d.userId);
  const lost = users.size;
  const base = payersNow + lost; // pagantes no início ≈ os de hoje + os que saíram
  return { lost, rate: base ? Math.round((lost / base) * 1000) / 10 : 0 };
}

// ---------- Funil ----------

export type FunnelStep = { key: string; label: string; count: number; pctOfFirst: number; pctOfPrev: number };

export function funnel(steps: { key: string; label: string; count: number }[]): FunnelStep[] {
  const first = steps[0]?.count ?? 0;
  return steps.map((s, i) => {
    const prev = i === 0 ? s.count : steps[i - 1]!.count;
    return { ...s, pctOfFirst: first ? Math.round((s.count / first) * 1000) / 10 : 0, pctOfPrev: prev ? Math.round((s.count / prev) * 1000) / 10 : 0 };
  });
}

/** Funil da coorte cadastrada no período: cadastro → teste → pediu plano → pagante. */
export function trialFunnel(users: AdminUser[], subs: AdminSub[], requesters: Set<string>, from: Date, to: Date) {
  const cohort = users.filter((u) => inRange(u.createdAt, from, to));
  const subUsers = new Set(subs.map((s) => s.userId));
  const paidUsers = new Set(subs.filter((s) => s.status === "AUTHORIZED").map((s) => s.userId));
  const trial = cohort.filter((u) => u.trialEndsAt);
  const asked = trial.filter((u) => requesters.has(u.id) || u.planRequestedAt || subUsers.has(u.id) || isPaidPlan(u.plan));
  const paid = asked.filter((u) => isPaidPlan(u.plan) || paidUsers.has(u.id));
  return funnel([
    { key: "signup", label: "Cadastros", count: cohort.length },
    { key: "trial", label: "Começaram o teste", count: trial.length },
    { key: "asked", label: "Pediram um plano", count: asked.length },
    { key: "paid", label: "Viraram pagantes", count: paid.length },
  ]);
}

/** Testes que terminaram no período e quantos viraram pagantes. */
export function trialConversion(users: AdminUser[], from: Date, to: Date, now = new Date()) {
  const ended = users.filter((u) => u.trialEndsAt && u.trialEndsAt >= from && u.trialEndsAt < (to < now ? to : now));
  const converted = ended.filter((u) => isPaidPlan(u.plan)).length;
  return { ended: ended.length, converted, rate: ended.length ? Math.round((converted / ended.length) * 1000) / 10 : 0 };
}

// ---------- Ativação ----------

/** Cadastrados no período que fizeram o primeiro lançamento em até 7 dias. */
export function activation(users: AdminUser[], firstEntry: Map<string, Date>, from: Date, to: Date, now = new Date()) {
  // Só conta quem já teve os 7 dias para ativar
  const eligible = users.filter((u) => inRange(u.createdAt, from, to) && u.createdAt.getTime() + 7 * DAY <= now.getTime());
  const active = eligible.filter((u) => {
    const f = firstEntry.get(u.id);
    return f && f.getTime() - u.createdAt.getTime() <= 7 * DAY;
  }).length;
  return { eligible: eligible.length, activated: active, rate: eligible.length ? Math.round((active / eligible.length) * 1000) / 10 : 0 };
}

/** Usuários distintos com atividade em [from, to). */
export function activeUsers(activity: { userId: string; at: Date }[], from: Date, to: Date) {
  const s = new Set<string>();
  for (const a of activity) if (inRange(a.at, from, to)) s.add(a.userId);
  return s.size;
}

// ---------- Vencimentos e risco ----------

/** Próxima cobrança prevista: a partir da data de autorização, de mês em mês (ou de ano em ano). */
export function nextRenewal(authorizedAt: Date, interval: string, now = new Date()) {
  const step = months(interval);
  const d = new Date(authorizedAt);
  let n = 0;
  while (d <= now && n++ < 1200) d.setUTCMonth(d.getUTCMonth() + step);
  return d;
}

export type ExpiringItem = { userId: string; kind: "trial" | "renewal" | "paused" | "request"; at: Date; detail: string };

export function expiring(users: AdminUser[], subs: AdminSub[], now = new Date(), days = 7): ExpiringItem[] {
  const limit = new Date(now.getTime() + days * DAY);
  const out: ExpiringItem[] = [];
  const active = new Map(users.filter((u) => u.status === "ACTIVE").map((u) => [u.id, u]));
  for (const u of active.values()) {
    if (u.plan === "PESSOAL" && u.trialEndsAt && u.trialEndsAt > now && u.trialEndsAt <= limit) out.push({ userId: u.id, kind: "trial", at: u.trialEndsAt, detail: "Fim do teste grátis" });
    if (u.planRequest && u.planRequestedAt) out.push({ userId: u.id, kind: "request", at: u.planRequestedAt, detail: `Pediu o plano ${u.planRequest}` });
  }
  for (const s of subs) {
    if (!active.has(s.userId)) continue;
    if (s.status === "AUTHORIZED") {
      const at = nextRenewal(s.updatedAt, s.interval, now);
      if (at <= limit) out.push({ userId: s.userId, kind: "renewal", at, detail: `Renovação ${s.interval === "ANUAL" ? "anual" : "mensal"} (prevista)` });
    } else if (s.status === "PAUSED") out.push({ userId: s.userId, kind: "paused", at: s.updatedAt, detail: "Assinatura pausada" });
  }
  // Pedidos e pausas primeiro (esperam ação), depois por data
  const rank = { request: 0, paused: 1, trial: 2, renewal: 3 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.at.getTime() - b.at.getTime());
}

export type RiskItem = { userId: string; reason: string; lastActivity: Date | null; daysIdle: number | null };

/** Pagantes e usuários em teste sem atividade há `idleDays` dias, e quem pediu exclusão da conta. */
export function atRisk(users: AdminUser[], lastActivity: Map<string, Date>, now = new Date(), idleDays = 14): RiskItem[] {
  const out: RiskItem[] = [];
  for (const u of users) {
    if (u.status !== "ACTIVE") continue;
    const last = lastActivity.get(u.id) ?? null;
    const idle = last ? Math.floor((now.getTime() - last.getTime()) / DAY) : null;
    const inTrial = u.plan === "PESSOAL" && !!u.trialEndsAt && u.trialEndsAt > now;
    if (u.deletionRequestedAt) out.push({ userId: u.id, reason: "Pediu a exclusão da conta", lastActivity: last, daysIdle: idle });
    else if ((isPaidPlan(u.plan) || inTrial) && (idle === null || idle >= idleDays))
      out.push({ userId: u.id, reason: `${isPaidPlan(u.plan) ? "Pagante" : "Em teste"} sem atividade ${idle === null ? "registrada" : `há ${idle} dias`}`, lastActivity: last, daysIdle: idle });
  }
  const del = (r: RiskItem) => (r.reason.startsWith("Pediu") ? 0 : 1);
  return out.sort((a, b) => del(a) - del(b) || (b.daysIdle ?? 1e9) - (a.daysIdle ?? 1e9));
}

// ---------- Recuperação ----------

export type RecoveryKind = "request" | "checkout" | "trial" | "risk";
export type RecoveryItem = { userId: string; kind: RecoveryKind; at: Date; detail: string; plan: PlanCode | null; days: number | null };

/**
 * Quem vale chamar: pediu plano e não ativou (1+ dia), começou o checkout e não pagou (1+ dia, últimos 30),
 * teste acabando em 7 dias ou que acabou há até 3 dias, e pagantes/testes sem uso há 14+ dias.
 * Uma pessoa aparece só no motivo mais forte (nessa ordem).
 */
export function recoveryList(users: AdminUser[], subs: AdminSub[], lastActivity: Map<string, Date>, now = new Date()): RecoveryItem[] {
  const out = new Map<string, RecoveryItem>();
  const ago = (d: Date) => (now.getTime() - d.getTime()) / DAY;
  const active = users.filter((u) => u.status === "ACTIVE" && !u.deletionRequestedAt);
  const ids = new Set(active.map((u) => u.id));
  const authorized = new Set(subs.filter((s) => s.status === "AUTHORIZED").map((s) => s.userId));
  for (const u of active) {
    if (u.planRequest && u.planRequestedAt && ago(u.planRequestedAt) >= 1)
      out.set(u.id, { userId: u.id, kind: "request", at: u.planRequestedAt, detail: `Pediu o plano ${u.planRequest} há ${Math.floor(ago(u.planRequestedAt))} dias`, plan: u.planRequest, days: null });
  }
  for (const s of [...subs].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())) {
    if (s.status !== "PENDING" || !ids.has(s.userId) || out.has(s.userId) || authorized.has(s.userId)) continue;
    const age = ago(s.createdAt);
    if (age >= 1 && age <= 30) out.set(s.userId, { userId: s.userId, kind: "checkout", at: s.createdAt, detail: `Checkout de ${s.plan} sem pagamento há ${Math.floor(age)} dias`, plan: s.plan, days: null });
  }
  for (const u of active) {
    if (out.has(u.id) || u.plan !== "PESSOAL" || !u.trialEndsAt) continue;
    const left = Math.ceil((u.trialEndsAt.getTime() - now.getTime()) / DAY);
    if (left <= 7 && left >= -3)
      out.set(u.id, { userId: u.id, kind: "trial", at: u.trialEndsAt, detail: left > 0 ? `Teste acaba em ${left} ${left === 1 ? "dia" : "dias"}` : left === 0 ? "Teste acaba hoje" : `Teste acabou há ${-left} ${left === -1 ? "dia" : "dias"}`, plan: null, days: left });
  }
  for (const r of atRisk(active, lastActivity, now)) {
    if (out.has(r.userId)) continue;
    out.set(r.userId, { userId: r.userId, kind: "risk", at: r.lastActivity ?? now, detail: r.reason, plan: null, days: r.daysIdle });
  }
  const rank: Record<RecoveryKind, number> = { request: 0, checkout: 1, trial: 2, risk: 3 };
  return [...out.values()].sort((a, b) => rank[a.kind] - rank[b.kind] || a.at.getTime() - b.at.getTime());
}

// ---------- Conversão ----------

export type CohortRow = { key: string; signups: number; activated: number; asked: number; paid: number; rate: number };

/**
 * Coortes de cadastro (por semana, ou por mês no período de 12 meses): quantos ativaram (1º lançamento em 7 dias),
 * pediram plano e viraram pagantes. `group` troca a coorte por outra chave (ex.: origem do cadastro).
 */
export function cohorts(
  users: (AdminUser & { group?: string })[], subs: AdminSub[], requesters: Set<string>, firstEntry: Map<string, Date>,
  w: Pick<PeriodWindow, "from" | "to" | "bucket">, by: "bucket" | "group" = "bucket",
): CohortRow[] {
  const bucket: Bucket = w.bucket === "month" ? "month" : "week";
  const subUsers = new Set(subs.map((s) => s.userId));
  const paidUsers = new Set(subs.filter((s) => s.status === "AUTHORIZED").map((s) => s.userId));
  const rows = new Map<string, CohortRow>();
  if (by === "bucket") for (const k of bucketKeys({ ...w, bucket })) rows.set(k, { key: k, signups: 0, activated: 0, asked: 0, paid: 0, rate: 0 });
  for (const u of users) {
    if (!inRange(u.createdAt, w.from, w.to)) continue;
    const k = by === "bucket" ? bucketKey(u.createdAt, bucket) : u.group ?? "Outros";
    const r = rows.get(k) ?? { key: k, signups: 0, activated: 0, asked: 0, paid: 0, rate: 0 };
    rows.set(k, r);
    r.signups++;
    const f = firstEntry.get(u.id);
    if (f && f.getTime() - u.createdAt.getTime() <= 7 * DAY) r.activated++;
    const paid = isPaidPlan(u.plan) || paidUsers.has(u.id);
    if (paid || requesters.has(u.id) || u.planRequestedAt || subUsers.has(u.id)) r.asked++;
    if (paid) r.paid++;
  }
  const out = [...rows.values()].map((r) => ({ ...r, rate: r.signups ? Math.round((r.paid / r.signups) * 1000) / 10 : 0 }));
  return by === "bucket" ? out.reverse() : out.sort((a, b) => b.signups - a.signups);
}

// ---------- Leads ----------

export type LeadStatus = "unfinished" | "trial" | "trial_over" | "asked" | "paid" | "free";
export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  unfinished: "Não concluiu o cadastro", trial: "Em teste", trial_over: "Teste acabou", asked: "Pediu plano", paid: "Pagante", free: "Plano Pessoal",
};

/** De onde veio: a utm_source do anúncio, a indicação de um cliente ou "Direto / sem origem". */
export function leadOrigin(u: { signupUtm?: unknown; referredById?: string | null }) {
  const utm = (u.signupUtm && typeof u.signupUtm === "object" ? u.signupUtm : {}) as Record<string, unknown>;
  const src = typeof utm.utm_source === "string" && utm.utm_source.trim() ? utm.utm_source.trim().toLowerCase() : null;
  const campaign = typeof utm.utm_campaign === "string" ? utm.utm_campaign : null;
  if (src) return { origin: src, campaign };
  if (typeof utm.fbclid === "string") return { origin: "facebook (anúncio)", campaign };
  if (u.referredById) return { origin: "Indicação de cliente", campaign: null };
  return { origin: "Direto / sem origem", campaign: null };
}

export function leadStatus(u: AdminUser, paidUsers: Set<string>, asked: Set<string>, now = new Date()): LeadStatus {
  if (isPaidPlan(u.plan) || paidUsers.has(u.id)) return "paid";
  if (u.planRequest || asked.has(u.id)) return "asked";
  if (u.trialEndsAt && u.trialEndsAt > now) return "trial";
  if (u.trialEndsAt) return "trial_over";
  return "free";
}

/** Funil do lead no período: começou o cadastro → criou a conta → usou → pediu plano → pagou. */
export function leadFunnel(counts: { started: number; accounts: number; used: number; asked: number; paid: number }) {
  return funnel([
    { key: "started", label: "Começaram o cadastro", count: Math.max(counts.started, counts.accounts) },
    { key: "accounts", label: "Criaram a conta", count: counts.accounts },
    { key: "used", label: "Usaram (1º lançamento)", count: counts.used },
    { key: "asked", label: "Pediram um plano", count: counts.asked },
    { key: "paid", label: "Viraram pagantes", count: counts.paid },
  ]);
}
