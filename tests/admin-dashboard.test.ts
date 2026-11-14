import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "./helpers";
import { prisma } from "@/server/db";
import { adminDashboard } from "@/server/services/admin-dashboard";
import { listUsers, userFilterCounts } from "@/server/services/admin";
import {
  parsePeriod, periodWindow, periodDays, rangeText, delta, bucketKey, bucketKeys, seriesByBucket, revenue, churn, funnel, trialFunnel, trialConversion,
  activation, nextRenewal, expiring, atRisk, type AdminUser, type AdminSub,
} from "@/domain/admin-metrics";

const NOW = new Date("2026-11-13T15:00:00Z");
const DAY = 86_400_000;
const ago = (d: number) => new Date(NOW.getTime() - d * DAY);
const ahead = (d: number) => new Date(NOW.getTime() + d * DAY);
const user = (id: string, o: Partial<AdminUser> = {}): AdminUser => ({
  id, plan: "PESSOAL", planInterval: null, trialEndsAt: null, createdAt: ago(100), planRequest: null, planRequestedAt: null, deletionRequestedAt: null, status: "ACTIVE", ...o,
});
const sub = (id: string, userId: string, o: Partial<AdminSub> = {}): AdminSub => ({
  id, userId, plan: "PRO", interval: "MENSAL", amountCents: 1990, status: "AUTHORIZED", createdAt: ago(40), updatedAt: ago(40), ...o,
});

describe("período e comparação", () => {
  it("lê o período da URL com 30 dias por padrão", () => {
    expect(parsePeriod("7d")).toBe("7d");
    expect(parsePeriod("12m")).toBe("12m");
    expect(parsePeriod("x")).toBe("30d");
    expect(parsePeriod(undefined)).toBe("30d");
  });

  it("monta a janela atual e a anterior do mesmo tamanho, com o balde certo", () => {
    const w = periodWindow("30d", NOW);
    expect(w.to).toEqual(NOW);
    expect(w.from).toEqual(ago(30));
    expect(w.prevFrom).toEqual(ago(60));
    expect(w.prevTo).toEqual(w.from);
    expect(w.bucket).toBe("day");
    expect(periodWindow("90d", NOW).bucket).toBe("week");
    expect(periodWindow("12m", NOW).bucket).toBe("month");
  });

  it("aceita dias do calendário e todo o período na URL", () => {
    expect(parsePeriod("2026-11-01_2026-11-30")).toBe("2026-11-01_2026-11-30");
    expect(parsePeriod("all")).toBe("all");
    expect(parsePeriod("2026-11-30_2026-11-01")).toBe("30d"); // invertido
    expect(parsePeriod("2026-02-30_2026-03-01")).toBe("30d"); // dia que não existe
    expect(parsePeriod("2026-11-01")).toBe("30d");
  });

  it("monta a janela dos dias escolhidos no horário de Brasília, até agora quando o fim é futuro", () => {
    const w = periodWindow("2026-10-01_2026-10-31", NOW);
    expect(w.from).toEqual(new Date("2026-10-01T03:00:00Z"));
    expect(w.to).toEqual(new Date("2026-11-01T03:00:00Z"));
    expect(w.prevTo).toEqual(w.from);
    expect(w.prevFrom).toEqual(new Date(w.from.getTime() - 31 * DAY));
    expect(w.label).toBe("outubro de 2026");
    expect(w.phrase).toBe("em outubro de 2026");
    expect(w.bucket).toBe("day");
    const mes = periodWindow("2026-11-01_2026-11-30", NOW);
    expect(mes.to).toEqual(NOW);
    expect(periodWindow("2026-11-01_2026-11-13", NOW).phrase).toBe("de 01/11 a 13/11/2026");
    expect(periodWindow("2026-11-13_2026-11-13", NOW).phrase).toBe("em 13/11/2026");
    const tudo = periodWindow("all", NOW);
    expect(tudo.label).toBe("todo o período");
    expect(tudo.to).toEqual(NOW);
    expect(tudo.bucket).toBe("month");
    expect(periodWindow("30d", NOW).phrase).toBe("nos últimos 30 dias");
  });

  it("devolve os dias do período para o calendário", () => {
    expect(periodDays("2026-11-01_2026-11-30", NOW)).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(periodDays("all", NOW)).toBeNull();
    expect(periodDays("7d", NOW)).toEqual({ from: "2026-11-07", to: "2026-11-13" });
    expect(rangeText("2025-12-20_x".slice(0, 10), "2026-01-05")).toBe("20/12/2025 a 05/01/2026");
  });

  it("calcula a variação, sem dividir por zero", () => {
    expect(delta(150, 100)).toEqual({ pct: 50, dir: "up" });
    expect(delta(50, 100)).toEqual({ pct: -50, dir: "down" });
    expect(delta(5, 0)).toEqual({ pct: null, dir: "up" });
    expect(delta(0, 0)).toEqual({ pct: 0, dir: "flat" });
  });

  it("agrupa por dia de Brasília, semana (segunda) e mês", () => {
    // 01h UTC do dia 13 ainda é dia 12 em Brasília
    expect(bucketKey(new Date("2026-11-13T01:00:00Z"), "day")).toBe("2026-11-12");
    expect(bucketKey(new Date("2026-11-13T15:00:00Z"), "week")).toBe("2026-11-09");
    expect(bucketKey(new Date("2026-11-13T15:00:00Z"), "month")).toBe("2026-11-01");
    const keys = bucketKeys(periodWindow("7d", NOW));
    expect(keys[0]).toBe("2026-11-06");
    expect(keys.at(-1)).toBe("2026-11-13");
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("série por balde preenche zeros e conta cada usuário uma vez por dia", () => {
    const w = periodWindow("7d", NOW);
    const rows = seriesByBucket(w, {
      signups: [{ at: ago(1) }, { at: ago(1) }, { at: ago(20) }],
      active: [{ at: ago(1), id: "a" }, { at: new Date(ago(1).getTime() + 3_600_000), id: "a" }, { at: ago(1), id: "b" }],
    });
    expect(rows).toHaveLength(8);
    const d = rows.find((r) => r.day === "2026-11-12")!;
    expect(d.signups).toBe(2);
    expect(d.active).toBe(2);
    expect(rows.reduce((t, r) => t + Number(r.signups), 0)).toBe(2);
  });
});

describe("receita e churn", () => {
  it("MRR separa o que é cobrado no Mercado Pago do que foi ativado pelo admin", () => {
    const users = [
      user("mp", { plan: "PRO", planInterval: "MENSAL" }),
      user("anual", { plan: "GESTOR", planInterval: "ANUAL" }),
      user("manual", { plan: "GESTOR", planInterval: "MENSAL" }),
      user("off", { plan: "GESTOR", status: "DISABLED" }),
      user("free"),
    ];
    const subs = [sub("s1", "mp"), sub("s2", "anual", { plan: "GESTOR", interval: "ANUAL", amountCents: 40_200 }), sub("s3", "free", { status: "CANCELLED" })];
    const r = revenue(users, subs);
    expect(r.paidCents).toBe(1990 + 3350); // 402,00 / 12
    expect(r.manualCents).toBe(3990);
    expect(r.mrrCents).toBe(1990 + 3350 + 3990);
    expect(r.arrCents).toBe(r.mrrCents * 12);
    expect(r.payers).toBe(3);
    expect(r.arpuCents).toBe(Math.round(r.mrrCents / 3));
    expect(r.byPlan["GESTOR|ANUAL"]).toEqual({ count: 1, mrrCents: 3350 });
  });

  it("churn conta cancelamentos, pausas e rebaixamentos do período, uma vez por usuário", () => {
    const subs = [sub("a", "u1", { status: "CANCELLED", updatedAt: ago(3) }), sub("b", "u2", { status: "PAUSED", updatedAt: ago(40) })];
    const c = churn(subs, [{ userId: "u1", at: ago(2) }, { userId: "u3", at: ago(5) }], ago(30), NOW, 8);
    expect(c.lost).toBe(2);
    expect(c.rate).toBe(20);
    expect(churn([], [], ago(30), NOW, 0)).toEqual({ lost: 0, rate: 0 });
  });
});

describe("funil, ativação e conversão", () => {
  it("funil calcula as taxas sobre o início e sobre a etapa anterior", () => {
    const f = funnel([{ key: "a", label: "A", count: 200 }, { key: "b", label: "B", count: 50 }, { key: "c", label: "C", count: 5 }]);
    expect(f.map((s) => s.pctOfFirst)).toEqual([100, 25, 2.5]);
    expect(f.map((s) => s.pctOfPrev)).toEqual([100, 25, 10]);
    expect(funnel([{ key: "a", label: "A", count: 0 }])[0]!.pctOfFirst).toBe(0);
  });

  it("funil do teste usa só a coorte do período", () => {
    const users = [
      user("velho", { createdAt: ago(90), trialEndsAt: ago(75), plan: "PRO" }),
      user("sem-teste", { createdAt: ago(5) }),
      user("teste", { createdAt: ago(5), trialEndsAt: ahead(10) }),
      user("pediu", { createdAt: ago(10), trialEndsAt: ahead(5), planRequest: "PRO", planRequestedAt: ago(1) }),
      user("pediu-log", { createdAt: ago(12), trialEndsAt: ahead(3) }),
      user("pagou", { createdAt: ago(20), trialEndsAt: ago(5), plan: "GESTOR" }),
    ];
    const f = trialFunnel(users, [], new Set(["pediu-log"]), ago(30), NOW);
    expect(f.map((s) => s.count)).toEqual([5, 4, 3, 1]);
  });

  it("conversão conta só os testes que já terminaram no período", () => {
    const users = [user("a", { trialEndsAt: ago(3), plan: "PRO" }), user("b", { trialEndsAt: ago(4) }), user("c", { trialEndsAt: ahead(2) }), user("d", { trialEndsAt: ago(50) })];
    expect(trialConversion(users, ago(30), NOW, NOW)).toEqual({ ended: 2, converted: 1, rate: 50 });
  });

  it("ativação considera só quem já teve 7 dias e o 1º lançamento nesse prazo", () => {
    const users = [user("a", { createdAt: ago(20) }), user("b", { createdAt: ago(15) }), user("c", { createdAt: ago(3) }), user("d", { createdAt: ago(10) })];
    const first = new Map([["a", ago(19)], ["b", ago(1)], ["c", ago(2)]]);
    expect(activation(users, first, ago(30), NOW, NOW)).toEqual({ eligible: 3, activated: 1, rate: 33.3 });
  });
});

describe("vencimentos e risco", () => {
  it("próxima renovação avança mês a mês (ou ano a ano) a partir da autorização", () => {
    expect(nextRenewal(new Date("2026-09-20T12:00:00Z"), "MENSAL", NOW).toISOString()).toBe("2026-11-20T12:00:00.000Z");
    expect(nextRenewal(new Date("2025-12-01T12:00:00Z"), "ANUAL", NOW).toISOString()).toBe("2026-12-01T12:00:00.000Z");
  });

  it("lista pedidos, pausas, fim de teste e renovações dos próximos 7 dias", () => {
    const users = [
      user("t", { trialEndsAt: ahead(3) }),
      user("t-longe", { trialEndsAt: ahead(20) }),
      user("r", { plan: "PRO", planInterval: "MENSAL" }),
      user("p", { plan: "PRO" }),
      user("q", { planRequest: "GESTOR", planRequestedAt: ago(2) }),
      user("off", { status: "DISABLED", trialEndsAt: ahead(1) }),
    ];
    const subs = [sub("s1", "r", { updatedAt: new Date("2026-10-16T12:00:00Z") }), sub("s2", "p", { status: "PAUSED", updatedAt: ago(4) })];
    const e = expiring(users, subs, NOW);
    expect(e.map((x) => `${x.kind}:${x.userId}`)).toEqual(["request:q", "paused:p", "trial:t", "renewal:r"]);
  });

  it("em risco: pagantes e testes parados há 14 dias, e pedidos de exclusão primeiro", () => {
    const users = [
      user("pago-parado", { plan: "PRO" }),
      user("pago-ativo", { plan: "PRO" }),
      user("teste-nunca", { trialEndsAt: ahead(5) }),
      user("gratis-parado"),
      user("exclusao", { deletionRequestedAt: ago(1) }),
    ];
    const last = new Map([["pago-parado", ago(20)], ["pago-ativo", ago(2)], ["gratis-parado", ago(60)], ["exclusao", ago(1)]]);
    const r = atRisk(users, last, NOW);
    expect(r.map((x) => x.userId)).toEqual(["exclusao", "teste-nunca", "pago-parado"]);
    expect(r[2]!.daysIdle).toBe(20);
  });
});

describe("painel no banco", () => {
  beforeEach(resetDb);

  it("junta receita, funil, atividade, uso e vencimentos sem contar admins", async () => {
    const now = new Date();
    const d = (n: number) => new Date(now.getTime() - n * DAY);
    const mk = (email: string, data: Record<string, unknown> = {}) => prisma.user.create({ data: { name: email.split("@")[0]!, email, passwordHash: "x", ...data } });
    await mk("admin@x.test", { role: "ADMIN", createdAt: d(2) });
    const pro = await mk("pro@x.test", { plan: "PRO", planInterval: "MENSAL", createdAt: d(10), trialEndsAt: d(1) });
    const trial = await mk("trial@x.test", { createdAt: d(5), trialEndsAt: new Date(now.getTime() + 2 * DAY) });
    const asked = await mk("asked@x.test", { createdAt: d(40), trialEndsAt: d(25), planRequest: "GESTOR", planRequestInterval: "MENSAL", planRequestedAt: d(3) });
    await mk("old@x.test", { createdAt: d(45) });
    await prisma.subscription.create({ data: { userId: pro.id, plan: "PRO", interval: "MENSAL", amountCents: 1990, status: "AUTHORIZED", externalId: "pre-1", updatedAt: d(27) } });
    await prisma.auditLog.create({ data: { actorId: asked.id, action: "billing.plan_request", targetType: "User", targetId: asked.id } });
    await prisma.session.create({ data: { id: "s1", userId: trial.id, expiresAt: new Date(now.getTime() + DAY) } });
    await prisma.loginAttempt.create({ data: { email: "x@x.test", ip: "1.1.1.1", success: false } });

    const r = await adminDashboard("30d", new Date(Date.now() + 1000)); // depois dos registros criados agora pelo banco
    expect(r.revenue.mrrCents).toBe(1990);
    expect(r.revenue.paidCents).toBe(1990);
    expect(r.revenue.payers).toBe(1);
    expect(r.revenue.trialsActive).toBe(1);
    expect(r.growth.totalUsers).toBe(4); // sem o admin
    expect(r.growth.signups.cur).toBe(2);
    expect(r.growth.signups.prev).toBe(2);
    expect(r.growth.signups.delta).toEqual({ pct: 0, dir: "flat" });
    expect(r.growth.dau).toBe(1);
    expect(r.growth.series.reduce((t, x) => t + x.signups, 0)).toBe(2);
    expect(r.funnel.map((s) => s.count)).toEqual([2, 2, 1, 1]);
    expect(r.health.pendingRequests).toBe(1);
    expect(r.health.loginFailures.cur).toBe(1);
    expect(r.expiring.map((e) => e.kind).sort()).toEqual(["renewal", "request", "trial"]);
    expect(r.expiring.find((e) => e.kind === "trial")!.user.name).toBe("trial");
    // pagante sem atividade nenhuma fica em risco; o teste com login recente não
    expect(r.risk.map((x) => x.userId)).toEqual([pro.id]);
    expect(r.usage.find((u) => u.key === "entries")!.cur).toBe(0);
  });

  it("filtros da aba Usuários", async () => {
    await prisma.user.createMany({
      data: [
        { name: "A", email: "a@x.test", passwordHash: "x", plan: "PRO" },
        { name: "B", email: "b@x.test", passwordHash: "x", trialEndsAt: new Date(Date.now() + DAY) },
        { name: "C", email: "c@x.test", passwordHash: "x", status: "DISABLED", deletionRequestedAt: new Date() },
      ],
    });
    expect((await listUsers(undefined, "paid")).map((u) => u.email)).toEqual(["a@x.test"]);
    expect((await listUsers(undefined, "trial")).map((u) => u.email)).toEqual(["b@x.test"]);
    expect((await listUsers("c@", "disabled")).map((u) => u.email)).toEqual(["c@x.test"]);
    expect(await listUsers("a@", "trial")).toHaveLength(0);
    expect(await listUsers(undefined, "inventado")).toHaveLength(3);
    expect(await userFilterCounts()).toMatchObject({ all: 3, paid: 1, trial: 1, deletion: 1, disabled: 1, request: 0, admin: 0 });
  });
});
