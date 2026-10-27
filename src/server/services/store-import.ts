import type { Prisma } from "@prisma/client";
import { prisma, DomainError, audit, log } from "../db";
import { evaluateStoreAlerts } from "./market";

// Coletor do catálogo de lojas (como a referência): lê a paridade de cada parceiro nas fontes dos
// próprios programas, guarda a oferta atual e o histórico diário (valor do dia e máximo do dia).
// Regras: só fontes que permitem acesso automatizado (robots.txt e sem bloqueio de robôs),
// identificando-se como robô, no máximo uma leitura por fonte a cada 10 minutos.
// Livelo, LATAM Pass, Smiles e Azul bloqueiam robôs: a Livelo entra pela página salva no navegador
// do admin (importLiveloPage) e as demais por planilha (CSV). Nunca contornamos bloqueios.
// Cashback: Méliuz permite leitura das páginas de loja (robots.txt). Cuponomia bloqueia robôs (403
// até no robots.txt) e não tem API/feed público: entra por planilha enviada pelo admin.
// Logos: baixados das próprias fontes e servidos pelo app (o navegador do usuário não vai a terceiros).

export type ImportedOffer = {
  storeName: string;
  pointsPerReal: number;
  upTo: boolean;
  perDollar: boolean;
  clubPointsPerReal?: number | null;
  regularPointsPerReal?: number | null; // fora da promoção ("Era N")
  promotion?: boolean;
  promoEndsAt?: Date | null;
  partnerLink?: string | null;
  logoUrl?: string | null;
};

const USER_AGENT = "MilhasXBot/1.0 (catalogo de lojas parceiras; leitura no maximo 1x por hora)";
const MIN_INTERVAL_MS = 10 * 60_000;

/* ---------------- Esfera ---------------- */

type EsferaItem = {
  displayName?: string;
  active?: boolean;
  esf_accumulationPrefix?: string | null;
  esf_accumulationValue?: string | null;
  esf_accumulationFactorValue?: string | null;
  esf_accumulationFactorDescription?: string | null;
  route?: string | null;
};

const num = (s: string | null | undefined) => {
  const n = Number(String(s ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** "Ganhe 1 pt a cada 2 reais" → 0,5 pt/R$; "Até 6 pts a cada real" → 6 (máximo); "4 pts a cada dólar" → por dólar. */
export function parseEsfera(json: unknown): ImportedOffer[] {
  const items = (json as { items?: EsferaItem[] })?.items;
  if (!Array.isArray(items)) throw new DomainError(502, "Resposta da Esfera em formato inesperado");
  const out: ImportedOffer[] = [];
  for (const it of items) {
    const name = it.displayName?.trim();
    const value = num(it.esf_accumulationValue);
    // Só ofertas por real ou por dólar gasto ("por assinatura" e afins são bônus fixos, não paridade)
    const unit = it.esf_accumulationFactorDescription ?? "";
    if (!name || it.active === false || value === null || !/rea(l|is)|d[oó]lar/i.test(unit)) continue;
    const per = num(it.esf_accumulationFactorValue) ?? 1;
    out.push({
      storeName: name,
      pointsPerReal: Math.round((value / per) * 100) / 100,
      upTo: /^at[eé]/i.test(it.esf_accumulationPrefix?.trim() ?? ""),
      perDollar: /d[oó]lar/i.test(unit),
      partnerLink: it.route ? `https://www.esfera.com.vc${it.route}` : null,
      // Logo: a Esfera bloqueia robôs nas imagens (403); o logo vem da Méliuz quando a loja existe lá
    });
  }
  return out;
}

/* ---------------- Livelo (página salva pelo admin) ---------------- */

type LiveloPartner = {
  name?: string;
  link?: string;
  image?: string | null;
  logo?: string | null;
  imageUrl?: string | null;
  parity?: {
    currency?: string | null;
    currencyValue?: number | null;
    parity?: number | null;
    parityClub?: number | null;
    parityBau?: number | null;
    promotion?: boolean;
    separatorSlug?: string | null;
    dateEnd?: string | null;
  } | null;
};

/** "2026-10-25-23:59:00 GMT-03:00" → Date */
function liveloDate(s?: string | null) {
  const m = s?.match(/^(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2}:\d{2}) GMT([+-]\d{2}):?(\d{2})$/);
  return m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : null;
}

/**
 * Lê a página "Todos os parceiros" da Livelo salva no navegador (Ctrl+S): os dados vêm no
 * __NEXT_DATA__ da própria página, na maior lista "configPartners".
 */
export function parseLiveloPage(html: string): ImportedOffer[] {
  const m = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new DomainError(400, "Não achei os dados da Livelo nesse arquivo. Salve a página “Todos os parceiros” completa (Ctrl+S).");
  let data: unknown;
  try {
    data = JSON.parse(m[1]!);
  } catch {
    throw new DomainError(400, "Os dados da página da Livelo estão incompletos. Salve a página de novo.");
  }
  const lists: LiveloPartner[][] = [];
  const walk = (o: unknown) => {
    if (!o || typeof o !== "object") return;
    const rec = o as Record<string, unknown>;
    if (Array.isArray(rec.configPartners)) lists.push(rec.configPartners as LiveloPartner[]);
    for (const v of Object.values(rec)) walk(v);
  };
  walk(data);
  const list = lists.sort((a, b) => b.length - a.length)[0];
  if (!list?.length) throw new DomainError(400, "A página não tem a lista de parceiros. Use a página “Juntar pontos › Todos os parceiros”.");
  const out: ImportedOffer[] = [];
  for (const p of list) {
    const name = p.name?.trim();
    const par = p.parity;
    const per = par?.currencyValue && par.currencyValue > 0 ? par.currencyValue : 1;
    if (!name || !par?.parity) continue;
    const r2 = (n: number) => Math.round((n / per) * 100) / 100;
    const regular = par.parityBau ? r2(par.parityBau) : null;
    const value = r2(par.parity);
    out.push({
      storeName: name,
      pointsPerReal: value,
      upTo: par.separatorSlug === "ATE",
      perDollar: /U\$|US\$|USD/i.test(par.currency ?? ""),
      clubPointsPerReal: par.parityClub ? r2(par.parityClub) : null,
      promotion: !!par.promotion,
      regularPointsPerReal: par.promotion && regular !== null && regular !== value ? regular : null,
      promoEndsAt: par.promotion ? liveloDate(par.dateEnd) : null,
      partnerLink: p.link?.trim() || null,
      logoUrl: [p.imageUrl, p.image, p.logo].find((u) => typeof u === "string" && /^https:\/\//.test(u)) ?? null,
    });
  }
  return out;
}

async function fetchEsfera(): Promise<ImportedOffer[]> {
  let res: Response;
  try {
    res = await fetch("https://apigw.esfera.com.vc/bff-product/ehcs/products?categoryId=esf02163", {
      headers: { "user-agent": USER_AGENT, accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new SourceUnavailable("A Esfera não respondeu. Tente mais tarde.");
  }
  if (!res.ok) throw new SourceUnavailable(`A Esfera recusou a consulta (HTTP ${res.status})`);
  return parseEsfera(await res.json());
}

export const SOURCES = {
  esfera: { label: "Esfera", programCode: "ESFERA", url: "https://www.esfera.com.vc/junte-pontos/junte-pontos/esf02163", fetch: fetchEsfera },
} as const;

/** Fontes que bloqueiam robôs: o admin salva a página no navegador e envia o arquivo. */
export const PAGE_SOURCES = {
  livelo: { label: "Livelo", programCode: "LIVELO", url: "https://www.livelo.com.br/juntar-pontos/todos-os-parceiros", parse: parseLiveloPage },
} as const;
export type PageSourceKey = keyof typeof PAGE_SOURCES;
export type SourceKey = keyof typeof SOURCES;

/* ---------------- Planilha (CSV) ---------------- */

/**
 * Planilha com cabeçalho: loja;pontos_por_real[;ate][;por_dolar]
 * Separador ";" ou ","; decimal com vírgula ou ponto; "ate"/"por_dolar" aceitam sim/não, 1/0, x.
 */
export function parseCsv(text: string): ImportedOffer[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new DomainError(400, "A planilha precisa de cabeçalho e ao menos uma linha");
  const sep = lines[0]!.includes(";") ? ";" : ",";
  const head = lines[0]!.split(sep).map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = col("loja", "parceiro", "nome");
  const iPts = col("pontos_por_real", "pontos", "pts_por_real", "paridade");
  if (iName < 0 || iPts < 0) throw new DomainError(400, "Cabeçalho precisa ter as colunas loja e pontos_por_real");
  const iUpTo = col("ate", "maximo");
  const iDollar = col("por_dolar", "dolar");
  const yes = (v?: string) => /^(s|sim|1|x|true|y|yes)$/i.test((v ?? "").trim());
  const out: ImportedOffer[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = line.split(sep);
    const name = c[iName]?.trim();
    const pts = num(c[iPts]?.trim());
    if (!name) return;
    if (pts === null) throw new DomainError(400, `Linha ${i + 2}: pontos por real inválido`);
    out.push({ storeName: name.slice(0, 100), pointsPerReal: Math.round(pts * 100) / 100, upTo: yes(c[iUpTo]), perDollar: yes(c[iDollar]) });
  });
  if (out.length > 2000) throw new DomainError(400, "Máximo de 2000 lojas por planilha");
  return out;
}

/* ---------------- Gravação ---------------- */

const cents = (n: number | null | undefined) => (n == null ? null : Math.round(n * 100));
/** Dia no fuso de São Paulo (o "dia" do histórico). */
export function spDay(d = new Date()) {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  return new Date(`${p}T00:00:00Z`);
}

export type ImportIssue = { item: string; reason: string };
export type ImportReport = { total: number; created: number; updated: number; unchanged: number; ignored: number; removed: number; issues: ImportIssue[]; message?: string; partial?: boolean };
export type RunStatus = "SUCCESS" | "PARTIAL" | "UNAVAILABLE" | "FAILED";

const MAX_ISSUES = 200;
const emptyReport = (): ImportReport => ({ total: 0, created: 0, updated: 0, unchanged: 0, ignored: 0, removed: 0, issues: [] });

/** A fonte não respondeu, recusou o acesso ou bloqueou robôs: nada foi alterado. */
export class SourceUnavailable extends DomainError {
  constructor(message: string) {
    super(502, message);
  }
}

/** Uma lista nova muito menor que a atual não remove nada (página incompleta, fonte instável). */
const SHRINK_GUARD = { minExisting: 20, ratio: 0.5 };

/** Confere uma oferta de pontos antes de gravar; devolve o motivo quando não serve. */
export function offerProblem(o: ImportedOffer): string | null {
  const name = o.storeName?.trim() ?? "";
  if (name.length < 2) return "nome da loja vazio";
  if (name.length > 100) return "nome da loja com mais de 100 caracteres";
  if (!Number.isFinite(o.pointsPerReal) || o.pointsPerReal <= 0) return "pontos por real ausente ou zero";
  if (o.pointsPerReal > 100) return "pontos por real acima de 100 (valor suspeito)";
  if (o.partnerLink && !/^https:\/\//i.test(o.partnerLink)) return "link do parceiro não é https";
  return null;
}

/** Tira inválidas e repetidas (fica o maior valor) e conta o que ficou de fora. */
function cleanOffers<T extends { storeName: string }>(offers: T[], problem: (o: T) => string | null, value: (o: T) => number) {
  const issues: ImportIssue[] = [];
  const byKey = new Map<string, T>();
  for (const o of offers) {
    const p = problem(o);
    if (p) {
      issues.push({ item: o.storeName?.trim() || "(sem nome)", reason: p });
      continue;
    }
    const key = storeKey(o.storeName);
    const cur = byKey.get(key);
    if (cur) issues.push({ item: o.storeName.trim(), reason: value(o) > value(cur) ? `repetida na lista (ficou o maior valor: ${value(o)})` : `repetida na lista (ficou o maior valor: ${value(cur)})` });
    if (!cur || value(o) > value(cur)) byKey.set(key, { ...o, storeName: o.storeName.trim() });
  }
  return { valid: byKey, issues };
}

type Tx = Prisma.TransactionClient;

/** Lojas por nome comparável (uma consulta), para não duplicar "C&A" × "C & A". */
async function storeIndex(tx: Tx) {
  const all = await tx.store.findMany({ select: { id: true, name: true } });
  const map = new Map<string, { id: string; name: string }>();
  for (const s of all) if (!map.has(storeKey(s.name))) map.set(storeKey(s.name), s);
  return map;
}

/**
 * Grava as ofertas de uma fonte para um programa, numa transação: cria lojas novas, atualiza as
 * existentes e remove as ofertas daquela fonte que sumiram da lista. Ofertas manuais e de outras
 * fontes ficam. Reexecutar com a mesma lista não muda nada (idempotente).
 */
export async function applyOffers(actorId: string | null, programId: string, source: string, offers: ImportedOffer[]): Promise<ImportReport> {
  const { valid, issues } = cleanOffers(offers, offerProblem, (o) => o.pointsPerReal);
  if (valid.size === 0) throw new DomainError(400, `Nenhuma loja válida na lista (${issues.length} ignoradas); nada foi alterado`);
  const now = new Date();
  const day = spDay(now);
  const report: ImportReport = { ...emptyReport(), total: valid.size, ignored: issues.length, issues: issues.slice(0, MAX_ISSUES) };
  const changedStores = new Set<string>();
  const touched: { storeId: string; logoUrl?: string | null }[] = [];
  await prisma.$transaction(async (tx) => {
    const stores = await storeIndex(tx);
    const existing = await tx.storeOffer.count({ where: { programId, source } });
    const seen = new Set<string>();
    for (const [key, o] of valid) {
      let store = stores.get(key);
      if (!store) {
        store = await tx.store.create({ data: { name: o.storeName }, select: { id: true, name: true } });
        stores.set(key, store);
      }
      const pointsPerReal = Math.round(o.pointsPerReal * 100);
      const fields = {
        pointsPerReal,
        upTo: o.upTo,
        perDollar: o.perDollar,
        clubPointsPerReal: cents(o.clubPointsPerReal),
        regularPointsPerReal: cents(o.regularPointsPerReal),
        promotion: !!o.promotion,
        promoEndsAt: o.promoEndsAt ?? null,
        partnerLink: o.partnerLink ?? null,
        observedAt: now,
      };
      const cur = await tx.storeOffer.findFirst({ where: { storeId: store.id, programId, source } });
      if (!cur) {
        await tx.storeOffer.create({ data: { storeId: store.id, programId, source, ...fields } });
        report.created++;
        changedStores.add(store.id);
      } else {
        const changed = cur.pointsPerReal !== pointsPerReal || cur.upTo !== o.upTo || cur.perDollar !== o.perDollar || cur.clubPointsPerReal !== fields.clubPointsPerReal || cur.promotion !== fields.promotion;
        await tx.storeOffer.update({ where: { id: cur.id }, data: fields });
        if (changed) {
          report.updated++;
          changedStores.add(store.id);
        } else report.unchanged++;
      }
      // Histórico do dia: último valor lido e o máximo do dia
      const dayKey = { storeId_programId_source_day: { storeId: store.id, programId, source, day } };
      const prev = await tx.parityDay.findUnique({ where: dayKey });
      const best = !prev || pointsPerReal > prev.maxPointsPerReal;
      await tx.parityDay.upsert({
        where: dayKey,
        create: { storeId: store.id, programId, source, day, pointsPerReal, maxPointsPerReal: pointsPerReal, clubPointsPerReal: fields.clubPointsPerReal, perDollar: o.perDollar, observedAt: now, maxObservedAt: now },
        update: { pointsPerReal, clubPointsPerReal: fields.clubPointsPerReal, perDollar: o.perDollar, observedAt: now, ...(best ? { maxPointsPerReal: pointsPerReal, maxObservedAt: now } : {}) },
      });
      seen.add(store.id);
      touched.push({ storeId: store.id, logoUrl: o.logoUrl });
    }
    // Lista bem menor que a atual: provável arquivo/página incompleta, então não remove nada
    if (existing >= SHRINK_GUARD.minExisting && valid.size < existing * SHRINK_GUARD.ratio) {
      report.partial = true;
      report.message = `A lista trouxe ${valid.size} lojas, menos da metade das ${existing} atuais: as que faltam foram mantidas. Confira se o arquivo está completo.`;
      return;
    }
    const gone = await tx.storeOffer.deleteMany({ where: { programId, source, storeId: { notIn: [...seen] } } });
    report.removed = gone.count;
  }, { timeout: 120_000, maxWait: 10_000 });
  for (const id of changedStores) await evaluateStoreAlerts(id);
  for (const t of touched) if (t.logoUrl) await ensureStoreLogo(t.storeId, t.logoUrl);
  return report;
}

/* ---------------- Execuções (relatório e estado de cada fonte) ---------------- */

const short = (m: string) => m.replace(/\s+/g, " ").slice(0, 500);

/** Executa uma importação registrando a tentativa (sucesso, parcial, fonte indisponível ou falha). */
async function runImport(source: string, actorId: string | null, fn: () => Promise<ImportReport>) {
  const startedAt = new Date();
  try {
    const r = await fn();
    const status: RunStatus = r.partial || r.ignored > 0 ? "PARTIAL" : "SUCCESS";
    await prisma.storeImportRun.create({
      data: { source, status, actorId, startedAt, finishedAt: new Date(), total: r.total, created: r.created, updated: r.updated, unchanged: r.unchanged, ignored: r.ignored, removed: r.removed, message: r.message ? short(r.message) : null, report: { issues: r.issues.slice(0, MAX_ISSUES) } },
    });
    await audit(prisma, actorId, "admin.store_import", "StoreOffer", null, { source, status, total: r.total, created: r.created, updated: r.updated, ignored: r.ignored, removed: r.removed });
    return { ...r, status };
  } catch (e) {
    // Pedido cedo demais não é tentativa: só avisa
    if (e instanceof DomainError && e.status === 429) throw e;
    const status: RunStatus = e instanceof SourceUnavailable ? "UNAVAILABLE" : "FAILED";
    // Mensagem do domínio é para o admin; erro inesperado vai só para o log (sem detalhes internos na tela)
    const message = e instanceof DomainError ? e.message : "Erro inesperado ao processar a importação";
    if (!(e instanceof DomainError)) log("error", "store_import.failed", { source, error: e instanceof Error ? e.message : String(e) });
    await prisma.storeImportRun.create({ data: { source, status, actorId, startedAt, finishedAt: new Date(), message: short(message) } });
    throw e instanceof DomainError ? e : new DomainError(500, message);
  }
}

/** Intervalo mínimo entre leituras da mesma fonte automática (conta toda tentativa, até as que falharam). */
async function checkInterval(source: string, ms: number, label: string) {
  const last = await prisma.storeImportRun.findFirst({ where: { source }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  if (last && Date.now() - last.startedAt.getTime() < ms) throw new DomainError(429, `Essa fonte foi lida há pouco. Aguarde ${label}.`);
}

async function programByCode(code: string) {
  const p = await prisma.program.findUnique({ where: { code }, select: { id: true } });
  if (!p) throw new DomainError(400, `Cadastre o programa ${code} antes de importar`);
  return p.id;
}

/** Importa uma fonte automática (respeitando o intervalo mínimo entre consultas). */
export async function importFromSource(actorId: string | null, key: SourceKey) {
  const src = SOURCES[key];
  if (!src) throw new DomainError(404, "Fonte desconhecida");
  await checkInterval(key, MIN_INTERVAL_MS, "10 minutos");
  return runImport(key, actorId, async () => {
    const programId = await programByCode(src.programCode);
    const offers = await src.fetch();
    if (offers.length === 0) throw new SourceUnavailable("A fonte não trouxe nenhuma loja; nada foi alterado");
    log("info", "store_import.fetched", { source: key, count: offers.length });
    return applyOffers(actorId, programId, key, offers);
  });
}

/** Importa a página de parceiros salva pelo admin (fontes que bloqueiam robôs). */
export async function importSavedPage(actorId: string, key: PageSourceKey, html: string) {
  const src = PAGE_SOURCES[key];
  if (!src) throw new DomainError(404, "Fonte desconhecida");
  return runImport(key, actorId, async () => {
    const offers = src.parse(html);
    if (offers.length === 0) throw new DomainError(400, "A página não trouxe nenhum parceiro com pontuação; nada foi alterado");
    return applyOffers(actorId, await programByCode(src.programCode), key, offers);
  });
}

/** Coleta todas as fontes automáticas (agendador e comando). Fonte lida há pouco é pulada. */
export async function collectAll(log_ = (m: string) => log("info", m, {})) {
  const results: Record<string, string> = {};
  for (const key of Object.keys(SOURCES) as SourceKey[]) {
    try {
      const r = await importFromSource(null, key);
      results[key] = `${r.total} lojas (${r.created} novas, ${r.updated} alteradas, ${r.ignored} ignoradas, ${r.removed} removidas)`;
    } catch (e) {
      results[key] = e instanceof Error ? e.message : String(e);
    }
    log_(`store_import.${key}: ${results[key]}`);
  }
  try {
    const r = await importMeliuz(null);
    results.meliuz = `${r.total} lojas com cashback (${r.updated + r.created} lidas, ${r.ignored} com falha de leitura)`;
  } catch (e) {
    results.meliuz = e instanceof Error ? e.message : String(e);
  }
  log_(`store_import.meliuz: ${results.meliuz}`);
  return results;
}

/** Histórico diário de uma loja (para o gráfico da loja). */
export async function storeParityHistory(storeId: string, days = 30) {
  const since = spDay(new Date(Date.now() - days * 86400_000));
  const rows = await prisma.parityDay.findMany({ where: { storeId, day: { gte: since } }, include: { program: { select: { name: true, color: true } } }, orderBy: { day: "asc" } });
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), program: r.program.name, color: r.program.color, source: r.source, value: r.pointsPerReal / 100, max: r.maxPointsPerReal / 100, club: r.clubPointsPerReal == null ? null : r.clubPointsPerReal / 100, perDollar: r.perDollar }));
}

/** Histórico diário do cashback de uma loja, por portal. */
export async function storeCashbackHistory(storeId: string, days = 30) {
  const since = spDay(new Date(Date.now() - days * 86400_000));
  const rows = await prisma.cashbackDay.findMany({ where: { storeId, day: { gte: since } }, orderBy: { day: "asc" } });
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), portal: r.portal, source: r.source, value: r.bps / 100, max: r.maxBps / 100 }));
}

/* ---------------- Logos ---------------- */

const LOGO_MAX_BYTES = 400_000;
const LOGO_TYPES = /^image\/(png|jpe?g|webp|gif|svg\+xml)$/;

// O endereço do logo vem de conteúdo de terceiros (página da Méliuz, página da Livelo enviada pelo
// admin): só baixa de servidores de imagem conhecidos, por https, para não virar acesso a rede interna.
const LOGO_HOSTS = ["s.staticz.com.br"];
const LOGO_HOST_SUFFIXES = [".livelo.com.br"];

export function logoHostAllowed(url: string) {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  return u.protocol === "https:" && !u.port && !u.username && (LOGO_HOSTS.includes(host) || LOGO_HOST_SUFFIXES.some((s) => host.endsWith(s)));
}

/** Baixa o logo da loja quando ela ainda não tem (ou quando a fonte trocou a imagem). */
export async function ensureStoreLogo(storeId: string, url: string) {
  const cur = await prisma.storeLogo.findUnique({ where: { storeId }, select: { sourceUrl: true } });
  // Já tem logo: só troca se a mesma fonte (mesmo site) mudou a imagem; logo enviado à mão fica
  if (cur && (!cur.sourceUrl || cur.sourceUrl === url || new URL(cur.sourceUrl).host !== new URL(url).host)) return false;
  if (!logoHostAllowed(url)) return false;
  try {
    // Sem seguir redirecionamento: um 3xx poderia levar a outro endereço fora da lista
    const res = await fetch(url, { headers: { "user-agent": USER_AGENT, accept: "image/*" }, redirect: "manual", signal: AbortSignal.timeout(15_000) });
    const mime = (res.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (!res.ok || !LOGO_TYPES.test(mime)) return false;
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length === 0 || data.length > LOGO_MAX_BYTES) return false;
    // SVG pode carregar script: só imagens de bitmap
    if (mime === "image/svg+xml") return false;
    await prisma.$transaction([
      prisma.storeLogo.upsert({ where: { storeId }, create: { storeId, mime, data, sourceUrl: url }, update: { mime, data, sourceUrl: url } }),
      prisma.store.update({ where: { id: storeId }, data: { logoUpdatedAt: new Date() } }),
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function getStoreLogo(storeId: string) {
  return prisma.storeLogo.findUnique({ where: { storeId }, select: { mime: true, data: true } });
}

/* ---------------- Méliuz (cashback) ---------------- */

const MELIUZ = "https://www.meliuz.com.br";
const MELIUZ_INTERVAL_MS = 6 * 3600_000;
const MELIUZ_DELAY_MS = 1_000;

/** Nome comparável entre fontes: sem acento, caixa, pontuação e espaços. */
export const storeKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/&/g, "e").replace(/[^a-z0-9]+/g, "");

/** Lista de lojas da Méliuz (/desconto): nome → endereço da página da loja. */
export function parseMeliuzIndex(html: string) {
  const out = new Map<string, { name: string; path: string }>();
  for (const m of html.matchAll(/<li><a href="(\/desconto\/[a-z0-9-]+)">([^<]{1,80})<\/a><\/li>/g)) {
    const name = m[2]!.replace(/&#0?39;/g, "'").replace(/&amp;/g, "&").trim();
    const key = storeKey(name);
    if (key && !out.has(key)) out.set(key, { name, path: m[1]! });
  }
  return out;
}

/** Página da loja na Méliuz: o cashback do botão de cadastro ("1,5% de cashback", "Até 8%...") e o logo. */
export function parseMeliuzStore(html: string) {
  const btn = html.match(/class="floating-signup-btn"[\s\S]{0,400}?<button[^>]*>\s*((?:at[eé]\s*)?)(\d+(?:,\d+)?)%\s*de cashback\s*<\/button>/i);
  const logo = html.match(/"primaryImageOfPage"\s*:\s*\{[^}]*"url"\s*:\s*"(https:\/\/[^"]+\.(?:png|jpe?g|webp))"/);
  return {
    percent: btn ? Number(btn[2]!.replace(",", ".")) : null,
    upTo: !!btn?.[1],
    logoUrl: logo?.[1] ?? null,
  };
}

async function meliuzGet(path: string) {
  let res: Response;
  try {
    res = await fetch(MELIUZ + path, { headers: { "user-agent": USER_AGENT, accept: "text/html" }, signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new SourceUnavailable("A Méliuz não respondeu. Tente mais tarde.");
  }
  if (!res.ok) throw new SourceUnavailable(`A Méliuz recusou a consulta (HTTP ${res.status})`);
  return res.text();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------------- Cashback (Méliuz automática; Cuponomia por arquivo) ---------------- */

export type CashbackOffer = { storeName: string; percent: number; upTo: boolean; link?: string | null; logoUrl?: string | null };

/** Portais de cashback que entram por arquivo do admin (não têm API/feed público e bloqueiam robôs). */
export const FILE_SOURCES = {
  cuponomia: { label: "Cuponomia", portal: "Cuponomia", url: "https://www.cuponomia.com.br/cashback" },
} as const;
export type FileSourceKey = keyof typeof FILE_SOURCES;

export function cashbackProblem(o: CashbackOffer): string | null {
  const name = o.storeName?.trim() ?? "";
  if (name.length < 2) return "nome da loja vazio";
  if (name.length > 100) return "nome da loja com mais de 100 caracteres";
  if (!Number.isFinite(o.percent) || o.percent <= 0) return "cashback ausente ou zero";
  if (o.percent > 100) return "cashback acima de 100%";
  if (o.link && !/^https:\/\//i.test(o.link)) return "link não é https";
  return null;
}

/**
 * Planilha de cashback (ex.: exportada/copiada da Cuponomia pelo admin), com cabeçalho:
 * loja;cashback[;link][;ate]  —  separador ";" ou ","; "1,5", "1.5" ou "1,5%"; "ate" aceita sim/não.
 * Linhas com problema não derrubam o arquivo: vão para o relatório como ignoradas.
 */
export function parseCashbackCsv(text: string): { offers: CashbackOffer[]; issues: ImportIssue[] } {
  if (/<html|<script|\u0000/i.test(text.slice(0, 2000))) throw new DomainError(400, "O arquivo não é uma planilha CSV (parece HTML ou binário). Exporte como CSV.");
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) throw new DomainError(400, "A planilha precisa de cabeçalho e ao menos uma linha");
  if (lines.length > 5001) throw new DomainError(400, "Máximo de 5000 lojas por planilha");
  const sep = lines[0]!.includes(";") ? ";" : ",";
  const head = lines[0]!.split(sep).map((h) => h.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""));
  const col = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iName = col("loja", "parceiro", "nome");
  const iPct = col("cashback", "percentual", "cashback_%", "%");
  if (iName < 0 || iPct < 0) throw new DomainError(400, "Cabeçalho precisa ter as colunas loja e cashback");
  const iLink = col("link", "url");
  const iUpTo = col("ate", "maximo");
  const yes = (v?: string) => /^(s|sim|1|x|true|y|yes)$/i.test((v ?? "").trim());
  const offers: CashbackOffer[] = [];
  const issues: ImportIssue[] = [];
  lines.slice(1).forEach((line, i) => {
    const c = line.split(sep).map((v) => v.trim().replace(/^"|"$/g, ""));
    const name = c[iName] ?? "";
    const raw = (c[iPct] ?? "").replace("%", "").trim();
    const pct = num(raw);
    if (!name && !raw) return;
    if (pct === null) return issues.push({ item: name || `linha ${i + 2}`, reason: `linha ${i + 2}: cashback inválido ("${raw.slice(0, 20)}")` });
    offers.push({ storeName: name, percent: Math.round(pct * 100) / 100, upTo: yes(c[iUpTo]) || /^at[eé]/i.test(c[iPct] ?? ""), link: c[iLink] || null });
  });
  return { offers, issues };
}

/**
 * Grava o cashback de um portal numa transação: cria/atualiza a oferta e o histórico do dia, e remove
 * as ofertas daquela fonte que sumiram (menos as de `keep`, cuja leitura falhou). Idempotente.
 */
export async function applyCashback(actorId: string | null, source: string, portal: string, offers: CashbackOffer[], opts: { createStores: boolean; keep?: Set<string>; issues?: ImportIssue[]; removeMissing?: boolean } = { createStores: true }): Promise<ImportReport> {
  const { valid, issues } = cleanOffers(offers, cashbackProblem, (o) => o.percent);
  issues.unshift(...(opts.issues ?? []));
  const now = new Date();
  const day = spDay(now);
  const report: ImportReport = { ...emptyReport(), total: valid.size, ignored: issues.length, issues: issues.slice(0, MAX_ISSUES) };
  const touched: { storeId: string; logoUrl?: string | null }[] = [];
  await prisma.$transaction(async (tx) => {
    const stores = await storeIndex(tx);
    const existing = await tx.storeOffer.count({ where: { source, programId: null } });
    const seen = new Set<string>(opts.keep ?? []);
    for (const [key, o] of valid) {
      let store = stores.get(key);
      if (!store) {
        if (!opts.createStores) continue;
        store = await tx.store.create({ data: { name: o.storeName }, select: { id: true, name: true } });
        stores.set(key, store);
      }
      const bps = Math.round(o.percent * 100);
      const fields = { cashbackBps: bps, portal, upTo: o.upTo, partnerLink: o.link ?? null, observedAt: now };
      const cur = await tx.storeOffer.findFirst({ where: { storeId: store.id, programId: null, source } });
      if (!cur) {
        await tx.storeOffer.create({ data: { storeId: store.id, programId: null, source, ...fields } });
        report.created++;
      } else {
        await tx.storeOffer.update({ where: { id: cur.id }, data: fields });
        if (cur.cashbackBps !== bps || cur.upTo !== o.upTo) report.updated++;
        else report.unchanged++;
      }
      const dayKey = { storeId_source_day: { storeId: store.id, source, day } };
      const prev = await tx.cashbackDay.findUnique({ where: dayKey });
      await tx.cashbackDay.upsert({
        where: dayKey,
        create: { storeId: store.id, source, portal, day, bps, maxBps: bps, observedAt: now },
        update: { bps, observedAt: now, ...(!prev || bps > prev.maxBps ? { maxBps: bps } : {}) },
      });
      seen.add(store.id);
      touched.push({ storeId: store.id, logoUrl: o.logoUrl });
    }
    if (opts.removeMissing === false) return;
    if (existing >= SHRINK_GUARD.minExisting && seen.size < existing * SHRINK_GUARD.ratio) {
      report.partial = true;
      report.message = `A lista trouxe ${seen.size} lojas, menos da metade das ${existing} atuais: as que faltam foram mantidas. Confira se o arquivo está completo.`;
      return;
    }
    const gone = await tx.storeOffer.deleteMany({ where: { source, programId: null, storeId: { notIn: [...seen] } } });
    report.removed = gone.count;
  }, { timeout: 120_000, maxWait: 10_000 });
  for (const t of touched) if (t.logoUrl) await ensureStoreLogo(t.storeId, t.logoUrl);
  return report;
}

/** Importa o arquivo de cashback de um portal enviado pelo admin (ex.: Cuponomia). */
export async function importCashbackFile(actorId: string, key: FileSourceKey, text: string) {
  const src = FILE_SOURCES[key];
  if (!src) throw new DomainError(404, "Fonte desconhecida");
  return runImport(key, actorId, async () => {
    const { offers, issues } = parseCashbackCsv(text);
    if (offers.length === 0) throw new DomainError(400, `Nenhuma loja com cashback válido no arquivo (${issues.length} linhas ignoradas); nada foi alterado`);
    const r = await applyCashback(actorId, key, src.portal, offers, { createStores: true, issues });
    if (r.total === 0) throw new DomainError(400, `Nenhuma loja com cashback válido no arquivo (${r.ignored} linhas ignoradas); nada foi alterado`);
    return r;
  });
}

/**
 * Cashback da Méliuz para as lojas do catálogo: lê a lista de lojas e, uma por segundo, a página de
 * cada loja que já existe aqui (não cria lojas). No máximo a cada 6 horas. Página que falhar na
 * leitura mantém a oferta anterior (não apaga dado bom por falta de leitura).
 */
export async function importMeliuz(actorId: string | null, opts: { force?: boolean; manual?: boolean; get?: (path: string) => Promise<string>; delayMs?: number } = {}) {
  const get = opts.get ?? meliuzGet;
  // Agendador: a cada 6 horas; botão do admin: no máximo a cada 10 minutos
  if (!opts.force) await checkInterval("meliuz", opts.manual ? MIN_INTERVAL_MS : MELIUZ_INTERVAL_MS, opts.manual ? "10 minutos" : "6 horas");
  return runImport("meliuz", actorId, async () => {
    let index: ReturnType<typeof parseMeliuzIndex>;
    try {
      index = parseMeliuzIndex(await get("/desconto"));
    } catch (e) {
      throw e instanceof SourceUnavailable ? e : new SourceUnavailable("A Méliuz não respondeu à lista de lojas");
    }
    if (index.size === 0) throw new SourceUnavailable("A lista de lojas da Méliuz veio vazia; nada foi alterado");
    const stores = await prisma.store.findMany({ where: { active: true }, select: { id: true, name: true } });
    const offers: CashbackOffer[] = [];
    const keep = new Set<string>();
    const issues: ImportIssue[] = [];
    let read = 0;
    for (const st of stores) {
      const hit = index.get(storeKey(st.name));
      if (!hit) continue;
      if (read > 0) await sleep(opts.delayMs ?? MELIUZ_DELAY_MS);
      read++;
      try {
        const page = parseMeliuzStore(await get(hit.path));
        if (page.logoUrl) await ensureStoreLogo(st.id, page.logoUrl);
        if (page.percent !== null && page.percent > 0) offers.push({ storeName: st.name, percent: page.percent, upTo: page.upTo, link: MELIUZ + hit.path });
      } catch {
        keep.add(st.id);
        issues.push({ item: st.name, reason: "não foi possível ler a página da loja (oferta anterior mantida)" });
      }
    }
    if (read > 0 && keep.size === read) throw new SourceUnavailable("Nenhuma página de loja da Méliuz pôde ser lida; nada foi alterado");
    return applyCashback(actorId, "meliuz", "Méliuz", offers, { createStores: false, keep, issues });
  });
}

/** Importa uma planilha de pontos para o programa escolhido. */
export async function importCsv(actorId: string, programId: string, text: string) {
  if (!(await prisma.program.findUnique({ where: { id: programId }, select: { id: true } }))) throw new DomainError(404, "Programa não encontrado");
  return runImport("csv", actorId, async () => applyOffers(actorId, programId, "csv", parseCsv(text)));
}

export type SourceState = {
  key: string; label: string; kind: "auto" | "page" | "file" | "csv"; url?: string;
  state: "SUCCESS" | "PARTIAL" | "WAITING_FILE" | "UNAVAILABLE" | "FAILED" | "NEVER";
  lastAttempt: string | null; lastSuccess: string | null; offers: number;
  last: { id: string; status: string; total: number; created: number; updated: number; unchanged: number; ignored: number; removed: number; message: string | null } | null;
};

/** Estado de cada fonte para o painel do admin: última tentativa, último sucesso e ofertas atuais. */
export async function importStatus(): Promise<SourceState[]> {
  const defs: { key: string; label: string; kind: SourceState["kind"]; url?: string }[] = [
    ...Object.entries(SOURCES).map(([key, s]) => ({ key, label: s.label, kind: "auto" as const, url: s.url })),
    { key: "meliuz", label: "Méliuz (cashback)", kind: "auto", url: `${MELIUZ}/desconto` },
    ...Object.entries(PAGE_SOURCES).map(([key, s]) => ({ key, label: s.label, kind: "page" as const, url: s.url })),
    ...Object.entries(FILE_SOURCES).map(([key, s]) => ({ key, label: `${s.label} (cashback)`, kind: "file" as const, url: s.url })),
    { key: "csv", label: "Planilha de pontos", kind: "csv" },
  ];
  return Promise.all(defs.map(async (d) => {
    const [last, ok, offers] = await Promise.all([
      prisma.storeImportRun.findFirst({ where: { source: d.key }, orderBy: { startedAt: "desc" } }),
      prisma.storeImportRun.findFirst({ where: { source: d.key, status: { in: ["SUCCESS", "PARTIAL"] } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
      prisma.storeOffer.count({ where: { source: d.key } }),
    ]);
    const state: SourceState["state"] = last ? (last.status as SourceState["state"]) : d.kind === "page" || d.kind === "file" ? "WAITING_FILE" : "NEVER";
    return {
      ...d, state, offers,
      lastAttempt: last?.startedAt.toISOString() ?? null,
      lastSuccess: ok?.startedAt.toISOString() ?? null,
      last: last ? { id: last.id, status: last.status, total: last.total, created: last.created, updated: last.updated, unchanged: last.unchanged, ignored: last.ignored, removed: last.removed, message: last.message } : null,
    };
  }));
}

/** Relatório completo de uma execução (itens ignorados e motivos). */
export async function importRunReport(id: string) {
  const r = await prisma.storeImportRun.findUnique({ where: { id } });
  if (!r) throw new DomainError(404, "Execução não encontrada");
  return { ...r, startedAt: r.startedAt.toISOString(), finishedAt: r.finishedAt.toISOString(), issues: ((r.report as { issues?: ImportIssue[] } | null)?.issues ?? []) };
}
