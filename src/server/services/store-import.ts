import { prisma, DomainError, audit, log } from "../db";
import { evaluateStoreAlerts } from "./market";

// Coletor do catálogo de lojas (como a referência): lê a paridade de cada parceiro nas fontes dos
// próprios programas, guarda a oferta atual e o histórico diário (valor do dia e máximo do dia).
// Regras: só fontes que permitem acesso automatizado (robots.txt e sem bloqueio de robôs),
// identificando-se como robô, no máximo uma leitura por fonte a cada 10 minutos.
// Livelo, LATAM Pass, Smiles e Azul bloqueiam robôs: a Livelo entra pela página salva no navegador
// do admin (importLiveloPage) e as demais por planilha (CSV). Nunca contornamos bloqueios.

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
    });
  }
  return out;
}

/* ---------------- Livelo (página salva pelo admin) ---------------- */

type LiveloPartner = {
  name?: string;
  link?: string;
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
    throw new DomainError(502, "A Esfera não respondeu. Tente mais tarde.");
  }
  if (!res.ok) throw new DomainError(502, `A Esfera recusou a consulta (HTTP ${res.status})`);
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

/**
 * Grava as ofertas de uma fonte para um programa: cria lojas novas, atualiza as existentes e
 * remove as ofertas daquela fonte que sumiram da lista. Ofertas manuais e de outras fontes ficam.
 */
export async function applyOffers(actorId: string | null, programId: string, source: string, offers: ImportedOffer[]) {
  // Mesma loja repetida na lista: fica o maior valor
  const byName = new Map<string, ImportedOffer>();
  for (const o of offers) {
    const key = o.storeName.trim().toLowerCase();
    const cur = byName.get(key);
    if (!cur || o.pointsPerReal > cur.pointsPerReal) byName.set(key, { ...o, storeName: o.storeName.trim() });
  }
  const existingStores = await prisma.store.findMany({ select: { id: true, name: true } });
  const storeByKey = new Map(existingStores.map((s) => [s.name.toLowerCase(), s]));
  let created = 0, updated = 0, unchanged = 0;
  const now = new Date();
  const day = spDay(now);
  const seen = new Set<string>();
  const changedStores = new Set<string>();
  for (const [key, o] of byName) {
    let store = storeByKey.get(key);
    if (!store) {
      store = await prisma.store.create({ data: { name: o.storeName }, select: { id: true, name: true } });
      storeByKey.set(key, store);
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
    const cur = await prisma.storeOffer.findFirst({ where: { storeId: store.id, programId, source } });
    if (!cur) {
      await prisma.storeOffer.create({ data: { storeId: store.id, programId, source, ...fields } });
      created++;
      changedStores.add(store.id);
    } else {
      const changed = cur.pointsPerReal !== pointsPerReal || cur.upTo !== o.upTo || cur.perDollar !== o.perDollar || cur.clubPointsPerReal !== fields.clubPointsPerReal || cur.promotion !== fields.promotion;
      await prisma.storeOffer.update({ where: { id: cur.id }, data: fields });
      if (changed) {
        updated++;
        changedStores.add(store.id);
      } else unchanged++;
    }
    // Histórico do dia: último valor lido e o máximo do dia
    const dayKey = { storeId_programId_source_day: { storeId: store.id, programId, source, day } };
    const prev = await prisma.parityDay.findUnique({ where: dayKey });
    const best = !prev || pointsPerReal > prev.maxPointsPerReal;
    await prisma.parityDay.upsert({
      where: dayKey,
      create: { storeId: store.id, programId, source, day, pointsPerReal, maxPointsPerReal: pointsPerReal, clubPointsPerReal: fields.clubPointsPerReal, perDollar: o.perDollar, observedAt: now, maxObservedAt: now },
      update: { pointsPerReal, clubPointsPerReal: fields.clubPointsPerReal, perDollar: o.perDollar, observedAt: now, ...(best ? { maxPointsPerReal: pointsPerReal, maxObservedAt: now } : {}) },
    });
    seen.add(store.id);
  }
  const gone = await prisma.storeOffer.findMany({ where: { programId, source, storeId: { notIn: [...seen] } }, select: { id: true } });
  if (gone.length) await prisma.storeOffer.deleteMany({ where: { id: { in: gone.map((g) => g.id) } } });
  for (const id of changedStores) await evaluateStoreAlerts(id);
  const result = { created, updated, unchanged, removed: gone.length, total: byName.size };
  await audit(prisma, actorId, "admin.store_import", "StoreOffer", null, { source, programId, ...result });
  return result;
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
  const last = await prisma.auditLog.findFirst({ where: { action: "admin.store_import", meta: { path: ["source"], equals: key } }, orderBy: { createdAt: "desc" } });
  if (last && Date.now() - last.createdAt.getTime() < MIN_INTERVAL_MS) throw new DomainError(429, "Essa fonte foi importada há pouco. Aguarde 10 minutos.");
  const programId = await programByCode(src.programCode);
  const offers = await src.fetch();
  if (offers.length === 0) throw new DomainError(502, "A fonte não trouxe nenhuma loja; nada foi alterado");
  log("info", "store_import.fetched", { source: key, count: offers.length });
  return applyOffers(actorId, programId, key, offers);
}

/** Importa a página de parceiros salva pelo admin (fontes que bloqueiam robôs). */
export async function importSavedPage(actorId: string, key: PageSourceKey, html: string) {
  const src = PAGE_SOURCES[key];
  if (!src) throw new DomainError(404, "Fonte desconhecida");
  const offers = src.parse(html);
  if (offers.length === 0) throw new DomainError(400, "A página não trouxe nenhum parceiro com pontuação");
  return applyOffers(actorId, await programByCode(src.programCode), key, offers);
}

/** Coleta todas as fontes automáticas (agendador e comando). Fonte lida há pouco é pulada. */
export async function collectAll(log_ = (m: string) => log("info", m, {})) {
  const results: Record<string, string> = {};
  for (const key of Object.keys(SOURCES) as SourceKey[]) {
    try {
      const r = await importFromSource(null, key);
      results[key] = `${r.total} lojas (${r.created} novas, ${r.updated} alteradas, ${r.removed} removidas)`;
    } catch (e) {
      results[key] = e instanceof Error ? e.message : String(e);
    }
    log_(`store_import.${key}: ${results[key]}`);
  }
  return results;
}

/** Histórico diário de uma loja (para o gráfico da loja). */
export async function storeParityHistory(storeId: string, days = 30) {
  const since = spDay(new Date(Date.now() - days * 86400_000));
  const rows = await prisma.parityDay.findMany({ where: { storeId, day: { gte: since } }, include: { program: { select: { name: true, color: true } } }, orderBy: { day: "asc" } });
  return rows.map((r) => ({ day: r.day.toISOString().slice(0, 10), program: r.program.name, color: r.program.color, source: r.source, value: r.pointsPerReal / 100, max: r.maxPointsPerReal / 100, club: r.clubPointsPerReal == null ? null : r.clubPointsPerReal / 100, perDollar: r.perDollar }));
}

/** Importa uma planilha para o programa escolhido. */
export async function importCsv(actorId: string, programId: string, text: string) {
  if (!(await prisma.program.findUnique({ where: { id: programId }, select: { id: true } }))) throw new DomainError(404, "Programa não encontrado");
  return applyOffers(actorId, programId, "csv", parseCsv(text));
}

export async function importStatus() {
  const runs = await prisma.auditLog.findMany({ where: { action: "admin.store_import" }, orderBy: { createdAt: "desc" }, take: 20 });
  type Meta = { source?: string; total?: number; created?: number; updated?: number; removed?: number };
  return runs.map((r) => ({ at: r.createdAt.toISOString(), ...(r.meta as Meta) }));
}
