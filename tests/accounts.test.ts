import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as recurrences from "@/app/api/recurrences/route";
import * as recurrence from "@/app/api/recurrences/[id]/route";
import * as credential from "@/app/api/accounts/[id]/credential/route";
import * as reveal from "@/app/api/accounts/[id]/credential/reveal/route";
import * as summary from "@/app/api/summary/route";
import { processDueRecurrences, addPeriod, encrypt, decrypt } from "@/server/services/accounts";
import { prisma } from "@/server/db";

let a: Client, b: Client, acc: string, userA: string;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  a = new Client();
  b = new Client();
  userA = (await a.call(register.POST, "POST", "/r", { name: "Ana", email: "a@x.test", password: "senha-forte-1" })).data.user.id;
  await b.call(register.POST, "POST", "/r", { name: "Bia", email: "b@x.test", password: "senha-forte-1" });
  const h = (await a.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  acc = (await a.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.livelo.id })).data.item.id;
});

describe("recorrências", () => {
  it("avança datas sem pular meses curtos", () => {
    expect(addPeriod(d("2026-01-31"), "MONTHLY").toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addPeriod(d("2026-11-15"), "QUARTERLY").toISOString().slice(0, 10)).toBe("2027-02-15");
    expect(addPeriod(d("2026-10-01"), "YEARLY").toISOString().slice(0, 10)).toBe("2027-10-01");
  });

  it("lança os ciclos vencidos uma única vez, mesmo com chamadas simultâneas", async () => {
    const r = await a.call(recurrences.POST, "POST", "/r", { accountId: acc, type: "CLUB", description: "Clube", points: 2000, costCents: 4990, frequency: "MONTHLY", nextDate: "2026-08-21", notify: true });
    expect(r.status).toBe(201);
    const today = d("2026-10-23");
    await Promise.all([processDueRecurrences(userA, today), processDueRecurrences(userA, today), processDueRecurrences(userA, today)]);
    expect(await prisma.entry.count({ where: { accountId: acc } })).toBe(3); // ago, set, out
    const rec = await prisma.recurrence.findFirstOrThrow();
    expect(rec.nextDate.toISOString().slice(0, 10)).toBe("2026-11-21");
    expect((await a.call(summary.GET, "GET", "/s")).data.totals).toMatchObject({ balance: 6000, costCents: 14970 });
    expect(await prisma.notification.count()).toBe(3);
    // nada a lançar de novo
    expect(await processDueRecurrences(userA, today)).toBe(0);
  });

  it("pausada não lança; outro usuário não altera", async () => {
    const r = (await a.call(recurrences.POST, "POST", "/r", { accountId: acc, type: "CLUB", description: "Clube", points: 1000, costCents: 0, frequency: "MONTHLY", nextDate: "2026-09-01", notify: false })).data.item;
    expect((await b.call(recurrence.PATCH, "PATCH", "/x", { active: false }, { id: r.id })).status).toBe(404);
    expect((await b.call(recurrences.POST, "POST", "/r", { accountId: acc, type: "CLUB", description: "X", points: 1, frequency: "MONTHLY", nextDate: "2026-09-01" })).status).toBe(404);
    await a.call(recurrence.PATCH, "PATCH", "/x", { active: false }, { id: r.id });
    expect(await processDueRecurrences(userA, d("2026-10-23"))).toBe(0);
  });
});

describe("credenciais", () => {
  it("criptografa com AES-GCM e detecta adulteração", () => {
    const enc = encrypt("minha-senha");
    expect(enc).not.toContain("minha-senha");
    expect(decrypt(enc)).toBe("minha-senha");
    const parts = enc.split(".");
    parts[3] = Buffer.from("xxxxxxxx").toString("base64");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("salva criptografado; mostrar exige a senha do usuário; outro usuário não acessa", async () => {
    expect((await a.call(credential.PUT, "PUT", "/c", { login: "12345678900", secret: "senha-do-programa" }, { id: acc })).status).toBe(200);
    const row = await prisma.accountCredential.findUniqueOrThrow({ where: { accountId: acc } });
    expect(row.secretEnc).not.toContain("senha-do-programa");
    expect(row.loginEnc).not.toContain("12345678900");

    expect((await a.call(reveal.POST, "POST", "/r", { password: "errada" }, { id: acc })).status).toBe(401);
    const ok = await a.call(reveal.POST, "POST", "/r", { password: "senha-forte-1" }, { id: acc });
    expect(ok.data).toMatchObject({ login: "12345678900", secret: "senha-do-programa" });
    expect(await prisma.auditLog.count({ where: { action: "credential.reveal" } })).toBe(1);

    expect((await b.call(reveal.POST, "POST", "/r", { password: "senha-forte-1" }, { id: acc })).status).toBe(404);
    expect((await b.call(credential.PUT, "PUT", "/c", { login: "x", secret: "y" }, { id: acc })).status).toBe(404);
  });

  it("bloqueia após 5 senhas erradas", async () => {
    await a.call(credential.PUT, "PUT", "/c", { login: "l", secret: "s" }, { id: acc });
    for (let i = 0; i < 5; i++) await a.call(reveal.POST, "POST", "/r", { password: "errada" }, { id: acc });
    expect((await a.call(reveal.POST, "POST", "/r", { password: "senha-forte-1" }, { id: acc })).status).toBe(429);
  });
});
