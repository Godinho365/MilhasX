// Importação de lojas: execuções registradas, validação, duplicatas, reexecução e fontes por arquivo.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as storeImport from "@/app/api/admin/store-import/route";
import { applyOffers, importCashbackFile, importSavedPage, importMeliuz, importStatus, parseCashbackCsv, type ImportedOffer } from "@/server/services/store-import";
import { prisma } from "@/server/db";

const livelo = readFileSync("tests/fixtures/livelo-sample.html", "utf8");
let liveloId: string;
let adminId: string;

beforeEach(async () => {
  await resetDb();
  liveloId = (await seedPrograms()).livelo.id;
  adminId = (await prisma.user.create({ data: { name: "Admin", email: "adm@x.test", passwordHash: "x", role: "ADMIN" } })).id;
});
afterEach(() => vi.unstubAllGlobals());

const offer = (storeName: string, pointsPerReal: number, extra: Partial<ImportedOffer> = {}): ImportedOffer => ({ storeName, pointsPerReal, upTo: false, perDollar: false, ...extra });
const CUPONOMIA = "loja;cashback;link;ate\nShopee;7%;https://www.cuponomia.com.br/desconto/shopee;\nRenner;5,5;;sim\n";

describe("Livelo (página salva)", () => {
  it("importação válida, reexecução idempotente e atualização", async () => {
    const r1 = await importSavedPage(adminId, "livelo", livelo);
    expect(r1).toMatchObject({ status: "SUCCESS", total: 7, created: 7, updated: 0, removed: 0, ignored: 0 });
    // mesma página de novo: nada novo, nada duplicado
    const r2 = await importSavedPage(adminId, "livelo", livelo);
    expect(r2).toMatchObject({ created: 0, updated: 0, unchanged: 7, removed: 0 });
    expect(await prisma.storeOffer.count({ where: { source: "livelo" } })).toBe(7);
    expect(await prisma.store.count()).toBe(7);
    // valor mudou na página: atualiza o registro existente, sem criar outro
    const changed = livelo.replace(/"name":"ACER"([\s\S]*?)"parity":2/, '"name":"ACER"$1"parity":3');
    expect(changed).not.toBe(livelo);
    const r3 = await importSavedPage(adminId, "livelo", changed);
    expect(r3).toMatchObject({ created: 0, updated: 1, unchanged: 6 });
    expect(await prisma.storeOffer.findFirstOrThrow({ where: { source: "livelo", store: { name: "ACER" } } })).toMatchObject({ pointsPerReal: 300 });
    expect(await prisma.storeImportRun.count({ where: { source: "livelo" } })).toBe(3);
  });

  it("arquivo inválido vira falha registrada e não apaga nada", async () => {
    await importSavedPage(adminId, "livelo", livelo);
    await expect(importSavedPage(adminId, "livelo", "<html>outra página</html>")).rejects.toThrow(/Ctrl\+S/);
    await expect(importSavedPage(adminId, "livelo", '<script id="__NEXT_DATA__" type="application/json">{quebrado</script>')).rejects.toThrow(/incompletos/);
    const last = await prisma.storeImportRun.findFirst({ where: { source: "livelo" }, orderBy: { startedAt: "desc" } });
    expect(last).toMatchObject({ status: "FAILED", message: expect.stringMatching(/incompletos/) });
    expect(await prisma.storeOffer.count({ where: { source: "livelo" } })).toBe(7);
  });
});

describe("validação, duplicatas e falha parcial", () => {
  it("ignora linhas inválidas e repetidas com o motivo, grava as boas", async () => {
    const r = await applyOffers(null, liveloId, "csv", [
      offer("Loja Boa", 3),
      offer("loja  boa", 5), // mesma loja (nome comparável): fica o maior valor
      offer("", 2),
      offer("Valor Absurdo", 900),
      offer("Link Ruim", 2, { partnerLink: "javascript:alert(1)" }),
    ]);
    expect(r).toMatchObject({ total: 1, created: 1, ignored: 4 });
    const reasons = r.issues.map((i) => i.reason);
    expect(reasons).toEqual([expect.stringMatching(/repetida.*5/), expect.stringMatching(/nome da loja vazio/), expect.stringMatching(/acima de 100/), expect.stringMatching(/https/)]);
    expect(await prisma.storeOffer.findFirstOrThrow({ where: { source: "csv" } })).toMatchObject({ pointsPerReal: 500 });
    await expect(applyOffers(null, liveloId, "csv", [offer("", 1)])).rejects.toThrow(/Nenhuma loja válida/);
  });

  it("lista bem menor que a atual não remove as que faltam (arquivo incompleto)", async () => {
    const full = Array.from({ length: 30 }, (_, i) => offer(`Loja ${i + 1}`, 2));
    await applyOffers(null, liveloId, "livelo", full);
    const r = await applyOffers(null, liveloId, "livelo", full.slice(0, 5));
    expect(r).toMatchObject({ partial: true, removed: 0 });
    expect(r.message).toMatch(/menos da metade/);
    expect(await prisma.storeOffer.count({ where: { source: "livelo" } })).toBe(30);
  });
});

describe("Cuponomia (planilha de cashback)", () => {
  it("lê a planilha, cria as lojas e é idempotente", async () => {
    const r = await importCashbackFile(adminId, "cuponomia", CUPONOMIA);
    expect(r).toMatchObject({ status: "SUCCESS", total: 2, created: 2 });
    const shopee = await prisma.store.findUniqueOrThrow({ where: { name: "Shopee" }, include: { offers: true, cashbackDays: true } });
    expect(shopee.offers[0]).toMatchObject({ programId: null, source: "cuponomia", portal: "Cuponomia", cashbackBps: 700, partnerLink: "https://www.cuponomia.com.br/desconto/shopee" });
    expect(shopee.cashbackDays).toHaveLength(1);
    expect(await prisma.storeOffer.findFirstOrThrow({ where: { store: { name: "Renner" } } })).toMatchObject({ cashbackBps: 550, upTo: true });
    const again = await importCashbackFile(adminId, "cuponomia", CUPONOMIA);
    expect(again).toMatchObject({ created: 0, unchanged: 2, removed: 0 });
    expect(await prisma.storeOffer.count({ where: { source: "cuponomia" } })).toBe(2);
    expect(await prisma.store.count()).toBe(2);
  });

  it("linhas ruins viram sucesso parcial; arquivo inválido ou vazio não altera nada", async () => {
    const p = parseCashbackCsv("loja;cashback\nBoa;3\nRuim;abc\nZero;0\n");
    expect(p.offers).toHaveLength(1);
    expect(p.issues.map((i) => i.reason)).toEqual([expect.stringMatching(/linha 3: cashback inválido/), expect.stringMatching(/linha 4: cashback inválido/)]);
    const r = await importCashbackFile(adminId, "cuponomia", "loja;cashback;link\nBoa;3;\nRuim;abc;\nZero;0;\nLink;2;javascript:x\n");
    expect(r).toMatchObject({ status: "PARTIAL", total: 1, ignored: 3 });
    await expect(importCashbackFile(adminId, "cuponomia", "<html><body>página</body></html>")).rejects.toThrow(/não é uma planilha/);
    await expect(importCashbackFile(adminId, "cuponomia", "loja;cashback\n")).rejects.toThrow(/cabeçalho e ao menos uma linha/);
    await expect(importCashbackFile(adminId, "cuponomia", "nome;valor\nX;1\n")).rejects.toThrow(/colunas loja e cashback/);
    await expect(importCashbackFile(adminId, "cuponomia", "loja;cashback\nX;0\n")).rejects.toThrow(/Nenhuma loja/);
    expect(await prisma.storeOffer.count({ where: { source: "cuponomia" } })).toBe(1);
    const last = await prisma.storeImportRun.findFirst({ where: { source: "cuponomia" }, orderBy: { startedAt: "desc" } });
    expect(last?.status).toBe("FAILED");
  });
});

describe("Méliuz: falha de leitura não apaga dado bom", () => {
  it("página que falhou mantém a oferta anterior; fonte fora do ar vira indisponível", async () => {
    await prisma.store.createMany({ data: [{ name: "Loja A" }, { name: "Loja B" }] });
    const idx = `<li><a href="/desconto/a">Loja A</a></li><li><a href="/desconto/b">Loja B</a></li>`;
    const pg = (v: string) => `<div class="floating-signup-btn" hidden><button>${v}% de cashback</button></div>`;
    await importMeliuz(null, { force: true, delayMs: 0, get: async (p) => (p === "/desconto" ? idx : pg(p.endsWith("a") ? "2" : "4")) });
    expect(await prisma.storeOffer.count({ where: { source: "meliuz" } })).toBe(2);
    // B falha na leitura: A atualiza, B fica como estava
    const r = await importMeliuz(null, {
      force: true, delayMs: 0,
      get: async (p) => {
        if (p.endsWith("b")) throw new Error("timeout");
        return p === "/desconto" ? idx : pg("3");
      },
    });
    expect(r).toMatchObject({ status: "PARTIAL", ignored: 1, removed: 0, updated: 1 });
    expect(await prisma.storeOffer.findFirstOrThrow({ where: { store: { name: "Loja B" } } })).toMatchObject({ cashbackBps: 400 });
    // lista fora do ar: indisponível, nada muda
    await expect(importMeliuz(null, { force: true, get: async () => { throw new Error("rede"); } })).rejects.toThrow(/não respondeu/);
    expect((await prisma.storeImportRun.findFirst({ where: { source: "meliuz" }, orderBy: { startedAt: "desc" } }))?.status).toBe("UNAVAILABLE");
    expect(await prisma.storeOffer.count({ where: { source: "meliuz" } })).toBe(2);
  });
});

describe("painel do admin", () => {
  it("estado por fonte, relatório da execução e só admin", async () => {
    const st0 = Object.fromEntries((await importStatus()).map((s) => [s.key, s.state]));
    expect(st0).toMatchObject({ livelo: "WAITING_FILE", cuponomia: "WAITING_FILE", esfera: "NEVER", meliuz: "NEVER" });
    await importCashbackFile(adminId, "cuponomia", "loja;cashback\nBoa;3\nRuim;x\n");
    const cup = (await importStatus()).find((s) => s.key === "cuponomia")!;
    expect(cup).toMatchObject({ state: "PARTIAL", offers: 1, last: { ignored: 1 } });
    expect(cup.lastSuccess).not.toBeNull();

    const c = new Client();
    await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" });
    expect((await c.call(storeImport.GET, "GET", `/x?run=${cup.last!.id}`)).status).toBe(403);
    expect((await c.call(storeImport.POST, "POST", "/x", { file: "cuponomia", csv: CUPONOMIA })).status).toBe(403);
    await prisma.user.update({ where: { email: "ana@x.test" }, data: { role: "ADMIN" } });
    const rep = await c.call(storeImport.GET, "GET", `/x?run=${cup.last!.id}`);
    expect(rep.data.item.issues).toEqual([expect.objectContaining({ item: "Ruim", reason: expect.stringMatching(/cashback inválido/) })]);
    const up = await c.call(storeImport.POST, "POST", "/x", { file: "cuponomia", csv: CUPONOMIA });
    expect(up.status).toBe(200);
    expect(up.data.result).toMatchObject({ created: 2 });
    expect((await c.call(storeImport.POST, "POST", "/x", { file: "naoexiste", csv: CUPONOMIA })).status).toBe(400);
  });
});
