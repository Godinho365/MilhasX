// Importação do catálogo de lojas: Esfera (amostra da resposta real) e planilha CSV
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as storeImport from "@/app/api/admin/store-import/route";
import { parseEsfera, parseCsv, applyOffers, importFromSource, parseLiveloPage, storeParityHistory } from "@/server/services/store-import";
import { listStores } from "@/server/services/market";
import { prisma } from "@/server/db";

const sample = JSON.parse(readFileSync("tests/fixtures/esfera-sample.json", "utf8"));
let esferaId: string;
let liveloId: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  liveloId = p.livelo.id;
  esferaId = (await prisma.program.create({ data: { name: "Esfera", code: "ESFERA", kind: "POINTS", marketValueCpmCents: 2600 } })).id;
});
afterEach(() => vi.unstubAllGlobals());

describe("leitura das fontes", () => {
  it("Esfera: pontos por real, 'até' e por dólar", () => {
    const r = Object.fromEntries(parseEsfera(sample).map((o) => [o.storeName, o]));
    expect(r["C&A"]).toEqual({ storeName: "C&A", pointsPerReal: 6, upTo: true, perDollar: false, partnerLink: null });
    expect(r["Brastemp"]!.pointsPerReal).toBe(0.5); // 1 pt a cada 2 reais
    expect(r["Azul"]!.pointsPerReal).toBe(0.25);
    expect(r["Booking.com"]).toMatchObject({ pointsPerReal: 4, perDollar: true });
    expect(r["Sem Pontuação"]).toBeUndefined();
    expect(r["Assinatura Exemplo"]).toBeUndefined(); // bônus por assinatura não é pontos por real
    expect(() => parseEsfera({ outra: 1 })).toThrow();
  });

  it("CSV: separador, decimal com vírgula e colunas opcionais", () => {
    expect(parseCsv("﻿Loja;Pontos_por_real;Até\nLoja A;2,5;sim\nLoja B;1;\n")).toEqual([
      { storeName: "Loja A", pointsPerReal: 2.5, upTo: true, perDollar: false },
      { storeName: "Loja B", pointsPerReal: 1, upTo: false, perDollar: false },
    ]);
    expect(() => parseCsv("nome,valor\nX,1")).toThrow(/loja e pontos_por_real/);
    expect(() => parseCsv("loja,pontos\nX,abc")).toThrow(/Linha 2/);
  });
});

describe("gravação", () => {
  it("cria, atualiza e remove só as ofertas da mesma fonte", async () => {
    const manual = await prisma.store.create({ data: { name: "C&A" } });
    await prisma.storeOffer.create({ data: { storeId: manual.id, programId: liveloId, pointsPerReal: 300 } }); // manual, outro programa
    const first = await applyOffers(null, esferaId, "esfera", parseEsfera(sample));
    expect(first).toMatchObject({ created: 6, updated: 0, removed: 0, total: 6 });
    expect(await prisma.store.count({ where: { name: "C&A" } })).toBe(1); // reaproveita a loja existente
    const next = parseEsfera(sample).filter((o) => o.storeName !== "Nike").map((o) => (o.storeName === "C&A" ? { ...o, pointsPerReal: 8 } : o));
    const second = await applyOffers(null, esferaId, "esfera", next);
    expect(second).toMatchObject({ created: 0, updated: 1, unchanged: 4, removed: 1 });
    expect(await prisma.storeOffer.count({ where: { programId: liveloId } })).toBe(1); // manual intacta
  });

  it("importa da Esfera pela rede (simulada), com intervalo mínimo, e só admin", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push(`${url} ${new Headers(init.headers).get("user-agent")}`);
      return new Response(JSON.stringify(sample), { status: 200 });
    });
    const r = await importFromSource(null, "esfera");
    expect(r.total).toBe(6);
    expect(calls[0]).toMatch(/^https:\/\/apigw\.esfera\.com\.vc\/.* MilhasXBot/);
    await expect(importFromSource(null, "esfera")).rejects.toThrow(/10 minutos/);

    const c = new Client();
    await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
    expect((await c.call(storeImport.POST, "POST", "/x", { source: "esfera" })).status).toBe(403);
    await prisma.user.update({ where: { email: "ana@x.test" }, data: { role: "ADMIN" } });
    const csv = await c.call(storeImport.POST, "POST", "/x", { programId: liveloId, csv: "loja;pontos_por_real\nLoja Planilha;3" });
    expect(csv.status).toBe(200);
    expect(csv.data.result).toMatchObject({ created: 1 });
  });

  it("fonte com erro ou vazia não apaga nada", async () => {
    await applyOffers(null, esferaId, "esfera", parseEsfera(sample));
    await prisma.auditLog.deleteMany();
    vi.stubGlobal("fetch", async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    await expect(importFromSource(null, "esfera")).rejects.toThrow(/nenhuma loja/);
    vi.stubGlobal("fetch", async () => new Response("bloqueado", { status: 403 }));
    await expect(importFromSource(null, "esfera")).rejects.toThrow(/HTTP 403/);
    expect(await prisma.storeOffer.count({ where: { source: "esfera" } })).toBe(6);
  });
});

describe("coletor como a referência", () => {
  const html = readFileSync("tests/fixtures/livelo-sample.html", "utf8");

  it("Livelo: lê a página salva (maior lista, Clube, promoção, 'Era', dólar e meio ponto)", () => {
    const r = Object.fromEntries(parseLiveloPage(html).map((o) => [o.storeName, o]));
    expect(Object.keys(r)).toHaveLength(7); // ignora o carrossel e o parceiro sem paridade
    expect(r["ACER"]).toMatchObject({ pointsPerReal: 2, clubPointsPerReal: 4, promotion: false, regularPointsPerReal: null });
    expect(r["Agaxtur Cruzeiros"]).toMatchObject({ pointsPerReal: 4, upTo: true, promotion: true, regularPointsPerReal: 2 });
    expect(r["Agaxtur Cruzeiros"]!.promoEndsAt?.toISOString()).toBe("2026-10-26T02:59:00.000Z");
    expect(r["Asics"]).toMatchObject({ pointsPerReal: 5, clubPointsPerReal: 7, regularPointsPerReal: 1 });
    expect(r["Bibi"]).toMatchObject({ pointsPerReal: 1, clubPointsPerReal: 6, promotion: true, regularPointsPerReal: null });
    expect(r["Loja Meio Ponto"]).toMatchObject({ pointsPerReal: 0.5, partnerLink: "https://livelo.com.br/juntar-pontos/parceiros/meio/MEI" });
    expect(r["Aliexpress"]).toMatchObject({ perDollar: true, upTo: true });
    expect(() => parseLiveloPage("<html>sem dados</html>")).toThrow(/Ctrl\+S/);
  });

  it("histórico do dia guarda o último valor e o máximo", async () => {
    const base = parseLiveloPage(html);
    const liveloCode = await prisma.program.findUniqueOrThrow({ where: { code: "LIVELO" } });
    await applyOffers(null, liveloCode.id, "livelo", base);
    await applyOffers(null, liveloCode.id, "livelo", base.map((o) => (o.storeName === "ACER" ? { ...o, pointsPerReal: 10 } : o)));
    await applyOffers(null, liveloCode.id, "livelo", base);
    const acer = await prisma.store.findUniqueOrThrow({ where: { name: "ACER" } });
    const days = await prisma.parityDay.findMany({ where: { storeId: acer.id } });
    expect(days).toHaveLength(1);
    expect(days[0]).toMatchObject({ pointsPerReal: 200, maxPointsPerReal: 1000, clubPointsPerReal: 400 });
    expect(await storeParityHistory(acer.id)).toEqual([expect.objectContaining({ program: "Livelo", value: 2, max: 10, club: 4 })]);
    const offer = await prisma.storeOffer.findFirstOrThrow({ where: { storeId: acer.id } });
    expect(offer.observedAt).not.toBeNull();
  });

  it("admin envia a página salva; usuário vê Clube e promoção na loja", async () => {
    const c = new Client();
    await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
    expect((await c.call(storeImport.POST, "POST", "/x", { page: "livelo", html })).status).toBe(403);
    await prisma.user.update({ where: { email: "ana@x.test" }, data: { role: "ADMIN" } });
    const r = await c.call(storeImport.POST, "POST", "/x", { page: "livelo", html });
    expect(r.status).toBe(200);
    expect(r.data.result).toMatchObject({ created: 7 });
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "ana@x.test" } });
    const list = await listStores(u.id, { q: "Asics" });
    expect(list.items[0]!.bestPoints).toMatchObject({ pointsPerReal: 5, club: 7, regular: 1, promotion: true, program: "Livelo" });
  });
});
