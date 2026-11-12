// Tráfego: os períodos do painel, as linhas dos anúncios do Meta (campanha, conjunto ou anúncio), os totais e a
// ligação com os pedidos que chegam pela página da agência (pelos parâmetros de URL que os anúncios mandam).
import { addDays, diffDays, isDay } from "./calendar";

export type TrafficPeriod = "hoje" | "ontem" | "7" | "30" | "custom";
export const TRAFFIC_PERIODS: { key: Exclude<TrafficPeriod, "custom">; label: string }[] = [
  { key: "hoje", label: "Hoje" }, { key: "ontem", label: "Ontem" }, { key: "7", label: "7 dias" }, { key: "30", label: "30 dias" },
];
/** Período personalizado de no máximo um ano (limite de consulta do Meta: 37 meses; aqui, um ano basta). */
export const MAX_TRAFFIC_DAYS = 366;
export type DayRange = { since: string; until: string };

export function trafficRange(p: TrafficPeriod, today: string, custom?: { since?: string | null; until?: string | null }): DayRange | null {
  if (p === "hoje") return { since: today, until: today };
  if (p === "ontem") return { since: addDays(today, -1), until: addDays(today, -1) };
  if (p === "7") return { since: addDays(today, -6), until: today };
  if (p === "30") return { since: addDays(today, -29), until: today };
  const s = custom?.since, u = custom?.until;
  if (!isDay(s) || !isDay(u) || u < s || u > today || diffDays(u, s) >= MAX_TRAFFIC_DAYS) return null;
  return { since: s, until: u };
}

export type TrafficLevel = "campaign" | "adset" | "ad";
export const TRAFFIC_LEVELS: Record<TrafficLevel, { label: string; one: string }> = {
  campaign: { label: "Campanhas", one: "campanha" }, adset: { label: "Conjuntos", one: "conjunto" }, ad: { label: "Criativos", one: "anúncio" },
};
export const isLevel = (l: unknown): l is TrafficLevel => l === "campaign" || l === "adset" || l === "ad";

export type TrafficRow = {
  level: TrafficLevel; id: string; name: string; accountId: string;
  campaignId: string; campaignName: string; adsetId: string | null; adsetName: string | null;
  spendCents: number; impressions: number; reach: number; clicks: number; linkClicks: number;
  conversations: number; leads: number;
  /** pedidos pela página ligados a esta linha (preenchido com os pedidos da agência) */
  orders: number;
};

const num = (v: unknown) => { const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN; return Number.isFinite(n) ? n : 0; };
const txt = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
type Action = { action_type?: string; value?: string | number };

/** Conversas iniciadas (anúncios para WhatsApp/Messenger/Direct). */
export const CONVERSATION_ACTION = "onsite_conversion.messaging_conversation_started_7d";
/** Leads: o "lead" do Meta já soma formulário e pixel; sem ele, soma os dois. */
function leadsOf(actions: Action[]) {
  const get = (t: string) => num(actions.find((a) => a.action_type === t)?.value);
  const total = get("lead");
  return total || get("onsite_conversion.lead_grouped") + get("offsite_conversion.fb_pixel_lead");
}

/** Uma linha do relatório do Meta (insights) no nosso formato. O valor gasto vem em texto, na moeda da conta. */
export function parseInsight(raw: Record<string, unknown>, level: TrafficLevel, accountId: string): TrafficRow {
  const actions = (Array.isArray(raw.actions) ? raw.actions : []) as Action[];
  const id = txt(level === "campaign" ? raw.campaign_id : level === "adset" ? raw.adset_id : raw.ad_id);
  const name = txt(level === "campaign" ? raw.campaign_name : level === "adset" ? raw.adset_name : raw.ad_name);
  return {
    level, id, name: name || id, accountId,
    campaignId: txt(raw.campaign_id), campaignName: txt(raw.campaign_name),
    adsetId: level === "campaign" ? null : txt(raw.adset_id) || null, adsetName: level === "campaign" ? null : txt(raw.adset_name) || null,
    spendCents: Math.round(num(raw.spend) * 100), impressions: Math.round(num(raw.impressions)), reach: Math.round(num(raw.reach)),
    clicks: Math.round(num(raw.clicks)), linkClicks: Math.round(num(raw.inline_link_clicks)),
    conversations: Math.round(num(actions.find((a) => a.action_type === CONVERSATION_ACTION)?.value)), leads: Math.round(leadsOf(actions)), orders: 0,
  };
}

export type TrafficTotals = {
  spendCents: number; impressions: number; clicks: number; linkClicks: number; conversations: number; leads: number; orders: number;
  ctr: number | null; cpcCents: number | null; cpmCents: number | null; costPerConversationCents: number | null; costPerLeadCents: number | null; costPerOrderCents: number | null;
};
const per = (cents: number, n: number) => (n > 0 ? Math.round(cents / n) : null);
/** Totais e as médias (o alcance não soma entre linhas: a mesma pessoa vê vários anúncios). */
export function trafficTotals(rows: Pick<TrafficRow, "spendCents" | "impressions" | "clicks" | "linkClicks" | "conversations" | "leads" | "orders">[]): TrafficTotals {
  const t = rows.reduce((a, r) => ({
    spendCents: a.spendCents + r.spendCents, impressions: a.impressions + r.impressions, clicks: a.clicks + r.clicks, linkClicks: a.linkClicks + r.linkClicks,
    conversations: a.conversations + r.conversations, leads: a.leads + r.leads, orders: a.orders + r.orders,
  }), { spendCents: 0, impressions: 0, clicks: 0, linkClicks: 0, conversations: 0, leads: 0, orders: 0 });
  return {
    ...t,
    ctr: t.impressions > 0 ? Math.round((t.linkClicks / t.impressions) * 10_000) / 100 : null,
    cpcCents: per(t.spendCents, t.linkClicks), cpmCents: t.impressions > 0 ? Math.round((t.spendCents / t.impressions) * 1000) : null,
    costPerConversationCents: per(t.spendCents, t.conversations), costPerLeadCents: per(t.spendCents, t.leads), costPerOrderCents: per(t.spendCents, t.orders),
  };
}

/* ---------------- Origem dos pedidos ---------------- */

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"] as const;
export type Utm = Partial<Record<(typeof UTM_KEYS)[number], string>>;
/** Os parâmetros de campanha de um endereço (ou de um objeto já lido); nulo se não tem nenhum. */
export function pickUtm(src: string | URLSearchParams | Record<string, unknown> | null | undefined): Utm | null {
  if (!src) return null;
  const get = typeof src === "string" ? ((p) => (k: string) => p.get(k))(new URLSearchParams(src.startsWith("?") ? src.slice(1) : src))
    : src instanceof URLSearchParams ? (k: string) => src.get(k)
    : (k: string) => (typeof src[k] === "string" ? (src[k] as string) : null);
  const out: Utm = {};
  for (const k of UTM_KEYS) {
    const v = get(k)?.trim().slice(0, 200);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Para colar no anúncio do Meta (Anúncio › Rastreamento › Parâmetros de URL): o pedido chega com os ids. */
export const META_URL_PARAMS = "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.id}}&utm_term={{adset.id}}&utm_content={{ad.id}}";
const META_SOURCES = new Set(["meta", "facebook", "fb", "instagram", "ig", "an", "msg"]);
/** O pedido veio de anúncio do Meta? (pelo utm_source ou pelo fbclid que o Meta acrescenta no clique) */
export const fromMeta = (u: Utm | null) => !!u && (!!u.fbclid || META_SOURCES.has((u.utm_source ?? "").toLowerCase()));

/**
 * Liga cada pedido à linha do relatório: no anúncio pelo utm_content, no conjunto pelo utm_term, na campanha pelo
 * utm_campaign (id, ou o nome, sem ligar para maiúsculas). Devolve as linhas com a contagem e quantos pedidos
 * vieram do Meta sem achar a linha (anúncio sem os parâmetros de URL, ou de outra conta).
 */
export function attributeOrders(rows: TrafficRow[], utms: (Utm | null)[]) {
  const counts = new Map<string, number>();
  const low = (s: string | undefined) => (s ?? "").trim().toLowerCase();
  let meta = 0, matched = 0;
  for (const u of utms) {
    if (!fromMeta(u)) continue;
    meta++;
    const hit = rows.find((r) =>
      r.level === "ad" ? u!.utm_content === r.id
      : r.level === "adset" ? u!.utm_term === r.id
      : u!.utm_campaign === r.id || (!!r.name && low(u!.utm_campaign) === low(r.name)));
    if (!hit) continue;
    matched++;
    const key = `${hit.accountId}:${hit.id}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return { rows: rows.map((r) => ({ ...r, orders: counts.get(`${r.accountId}:${r.id}`) ?? 0 })), meta, matched };
}
