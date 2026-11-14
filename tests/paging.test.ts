// Paginação das listas do admin: helper, barra de páginas e as listas paginadas no banco.
import { describe, it, expect, beforeEach } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { resetDb } from "./helpers";
import { prisma } from "@/server/db";
import { pageHref, pageItems, pageParam, paginate, paging } from "@/lib/paging";
import { Pagination } from "@/components/pagination";
import { listAudit, listPrivacyRequests, listUsersPage } from "@/server/services/admin";
import { subscriptionsOverview } from "@/server/services/admin-billing";
import { leadsData } from "@/server/services/admin-leads";
import { reportCsv } from "@/server/services/admin-reports";

describe("paginação: helper", () => {
  it("lê a página da URL; lixo vira 1", () => {
    expect(pageParam("3")).toBe(3);
    expect(pageParam(["4", "9"])).toBe(4);
    for (const v of [undefined, "", "0", "-2", "1.5", "abc", "1e400"]) expect(pageParam(v)).toBe(1);
  });

  it("limita a página ao total e calcula skip/take", () => {
    expect(paging(120, 2, 50)).toEqual({ page: 2, pages: 3, total: 120, pageSize: 50, skip: 50, take: 50 });
    expect(paging(120, 99, 50)).toMatchObject({ page: 3, skip: 100 }); // além da última: a última
    expect(paging(0, 5, 50)).toMatchObject({ page: 1, pages: 1, skip: 0 });
    expect(paginate([1, 2, 3, 4, 5], 3, 2)).toEqual({ page: 3, pages: 3, total: 5, pageSize: 2, items: [5] });
  });

  it("o link mantém todos os filtros da URL e troca só a página", () => {
    const sp = { p: "90d", s: "free", q: "ana maria", page: "2", vazio: "", tags: ["a", "b"] };
    const href = pageHref("/admin/leads", sp, "page", "lista");
    expect(href(3)).toBe("/admin/leads?p=90d&s=free&q=ana+maria&tags=a&tags=b&page=3#lista");
    expect(href(1)).toBe("/admin/leads?p=90d&s=free&q=ana+maria&tags=a&tags=b#lista"); // a 1ª sai sem ?page
    expect(pageHref("/admin/users", {})(1)).toBe("/admin/users");
    // segunda lista na mesma tela: mexe só no próprio parâmetro
    expect(pageHref("/admin/subscriptions", { s: "PAUSED", page: "2", mpage: "4" }, "mpage")(5)).toBe("/admin/subscriptions?s=PAUSED&page=2&mpage=5");
  });

  it("números da barra: primeira, última, vizinhas da atual e reticências", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(1, 5)).toEqual([1, 2, "gap", 5]);
    expect(pageItems(3, 5)).toEqual([1, 2, 3, 4, 5]); // "…" de um número só vira o número
    expect(pageItems(10, 20)).toEqual([1, "gap", 9, 10, 11, "gap", 20]);
    expect(pageItems(10, 20, 0)).toEqual([1, "gap", 10, "gap", 20]); // celular
    expect(pageItems(20, 20, 0)).toEqual([1, "gap", 20]);
  });
});

describe("paginação: barra", () => {
  type Props = Parameters<typeof Pagination>[0];
  const html = (props: Omit<Props, "href"> & { href?: Props["href"] }) => renderToStaticMarkup(createElement(Pagination, { href, ...props }));
  const href = (p: number) => `/admin/leads?s=free&page=${p}`;

  it("mostra o total, anterior/próxima e os números, com a atual marcada", () => {
    const out = html({ page: 3, pages: 25, total: 1234, pageSize: 50, noun: ["lead", "leads"] });
    expect(out).toContain("101–150");
    expect(out).toContain("1.234</b> leads");
    expect(out).toContain('href="/admin/leads?s=free&amp;page=2"'); // anterior
    expect(out).toContain('href="/admin/leads?s=free&amp;page=4"'); // próxima
    expect(out).toContain('href="/admin/leads?s=free&amp;page=25"');
    expect(out).toMatch(/aria-current="page"[^>]*>3</);
  });

  it("sem anterior na 1ª, sem próxima na última e sem números quando só há uma página", () => {
    expect(html({ page: 1, pages: 3, total: 120, pageSize: 50 })).toMatch(/aria-disabled="true" aria-label="Página anterior"/);
    expect(html({ page: 3, pages: 3, total: 120, pageSize: 50 })).toMatch(/aria-disabled="true" aria-label="Próxima página"/);
    const one = html({ page: 1, pages: 1, total: 7, pageSize: 50, noun: ["lead", "leads"] });
    expect(one).toContain("7</b> leads");
    expect(one).not.toContain("Próxima");
    expect(html({ page: 1, pages: 1, total: 0, pageSize: 50 })).toBe("");
  });
});

describe("paginação: listas do admin no banco", () => {
  beforeEach(resetDb);
  const base = new Date("2026-11-10T12:00:00Z");
  const at = (i: number) => new Date(base.getTime() - i * 60_000); // i = 0 é o mais recente

  it("Usuários: busca e filtro valem para o total; páginas sem repetir nem pular ninguém", async () => {
    await prisma.user.createMany({
      data: Array.from({ length: 123 }, (_, i) => ({ name: `Pessoa ${i}`, email: `p${String(i).padStart(3, "0")}@x.test`, passwordHash: "x", plan: i % 3 === 0 ? "PRO" as const : "PESSOAL" as const, createdAt: i < 10 ? base : at(i) })),
    });
    const p1 = await listUsersPage(undefined, null, 1, 50);
    const p3 = await listUsersPage(undefined, null, 3, 50);
    expect(p1).toMatchObject({ page: 1, pages: 3, total: 123 });
    expect(p3.items).toHaveLength(23);
    const seen = new Set<string>();
    for (const p of [1, 2, 3]) for (const u of (await listUsersPage(undefined, null, p, 50)).items) seen.add(u.id);
    expect(seen.size).toBe(123); // 10 criados no mesmo instante não se repetem entre páginas
    expect(await listUsersPage(undefined, "paid", 1, 50)).toMatchObject({ total: 41, pages: 1 });
    expect(await listUsersPage("p12", null, 1, 50)).toMatchObject({ total: 3 }); // p120, p121 e p122
    expect(await listUsersPage(undefined, null, 99, 50)).toMatchObject({ page: 3 });
  });

  it("Leads: página da lista com o filtro da URL, contadores do período inteiro e CSV com todos", async () => {
    const now = new Date();
    await prisma.user.createMany({ data: Array.from({ length: 75 }, (_, i) => ({ name: `L${i}`, email: `l${i}@x.test`, passwordHash: "x", createdAt: new Date(now.getTime() - (i + 1) * 60_000) })) });
    await prisma.emailCode.createMany({ data: Array.from({ length: 30 }, (_, i) => ({ email: `sem${i}@x.test`, purpose: "signup", codeHash: "x", ip: "127.0.0.1", expiresAt: now, createdAt: new Date(now.getTime() - (i + 1) * 30_000) })) });
    const all = await leadsData("30d", null, now, 2, 50);
    expect(all.total).toBe(105);
    expect(all.paging).toMatchObject({ page: 2, pages: 3, total: 105 });
    expect(all.list).toHaveLength(50);
    const free = await leadsData("30d", "free", now, 2, 50);
    expect(free.paging).toMatchObject({ page: 2, pages: 2, total: 75 });
    expect(free.list).toHaveLength(25);
    expect(free.list.every((l) => l.status === "free")).toBe(true);
    expect(free.counts.unfinished).toBe(30); // os chips continuam contando o período todo
    const admin = await prisma.user.create({ data: { name: "Admin", email: "adm@x.test", passwordHash: "x", role: "ADMIN" } });
    const csv = await reportCsv(admin.id, "leads", "30d");
    expect(csv.trim().split("\n")).toHaveLength(1 + 105);
  });

  it("Assinaturas: as duas listas paginam cada uma com o seu parâmetro", async () => {
    const users = await Promise.all(Array.from({ length: 60 }, (_, i) => prisma.user.create({ data: { name: `S${String(i).padStart(2, "0")}`, email: `s${i}@x.test`, passwordHash: "x", plan: i < 55 ? "PRO" : "PESSOAL" } })));
    await prisma.subscription.createMany({ data: users.map((u, i) => ({ userId: u.id, plan: "PRO" as const, interval: "MENSAL", amountCents: 1990, status: i < 52 ? "PENDING" : "AUTHORIZED" })) });
    const ov = await subscriptionsOverview("30d", null, new Date(), 2, 1, 50);
    expect(ov.listPaging).toMatchObject({ page: 2, pages: 2, total: 60 });
    expect(ov.list).toHaveLength(10);
    expect(ov.manualPaging).toMatchObject({ page: 1, pages: 2, total: 52 }); // PRO sem assinatura ativa (52 PENDING)
    expect(ov.manual).toHaveLength(50);
    const pend = await subscriptionsOverview("30d", "PENDING", new Date(), 1, 2, 50);
    expect(pend.listPaging).toMatchObject({ total: 52, pages: 2 });
    expect(pend.manual).toHaveLength(2);
  });

  it("LGPD e Auditoria: total do filtro e página além da última mostra a última", async () => {
    await prisma.privacyRequest.createMany({ data: Array.from({ length: 70 }, (_, i) => ({ name: `T${i}`, email: `t${i}@x.test`, kind: "ACCESS", status: i < 55 ? "NEW" : "DONE", createdAt: at(i) })) });
    expect((await listPrivacyRequests(null, 2, 50))).toMatchObject({ paging: { page: 2, pages: 2, total: 70 } });
    const news = await listPrivacyRequests("NEW", 9, 50);
    expect(news.paging).toMatchObject({ page: 2, total: 55 });
    expect(news.items).toHaveLength(5);
    expect(news.counts).toEqual({ NEW: 55, IN_PROGRESS: 0, DONE: 15 });

    await prisma.auditLog.createMany({ data: Array.from({ length: 120 }, (_, i) => ({ action: i % 2 ? "admin.x" : "user.y", targetType: "T", createdAt: at(i) })) });
    expect(await listAudit({ page: 50 })).toMatchObject({ page: 3, pages: 3, total: 120 });
    const adm = await listAudit({ action: "admin.", page: 2 });
    expect(adm).toMatchObject({ page: 2, pages: 2, total: 60 });
    expect(adm.items).toHaveLength(10);
  });
});
