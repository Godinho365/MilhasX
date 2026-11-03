import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as cards from "@/app/api/cards/route";
import * as card from "@/app/api/cards/[id]/route";
import * as detail from "@/app/api/cards/[id]/detail/route";
import * as reminders from "@/app/api/cards/[id]/reminders/route";
import * as reminder from "@/app/api/cards/[id]/reminders/[rid]/route";
import * as comments from "@/app/api/cards/[id]/comments/route";
import { quickReminder, nextDayOfMonth, nextReminderDate } from "@/domain/card-catalog";
import { upcomingCardReminders } from "@/server/services/card-details";
import { prisma } from "@/server/db";

let a: Client, b: Client;
let accA: string;
let userA: string;

beforeEach(async () => {
  await resetDb();
  const p = await seedPrograms();
  a = new Client();
  b = new Client();
  userA = (await a.call(register.POST, "POST", "/r", { name: "Ana", email: "a@x.test", password: "senha-forte-1" })).data.user.id;
  await b.call(register.POST, "POST", "/r", { name: "Bia", email: "b@x.test", password: "senha-forte-1" });
  const h = (await a.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
  accA = (await a.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.livelo.id })).data.item.id;
});

const base = { name: "Black da Ana", pointsPerDollar: 220, dollarRateCents: 550, closingDay: 3, dueDay: 10 };

describe("central de cartões", () => {
  it("guarda os dados do plástico, status, benefícios e tags; registra a atividade", async () => {
    const c = await a.call(cards.POST, "POST", "/c", { ...base, accountId: accA, bank: "Itaú", brand: "Mastercard", brandTier: "Mastercard Black", last4: "1234", printedName: "ana silva", modality: "CREDIT", cardType: "HOLDER", expMonth: 8, expYear: 2030, limitCents: 2000000, annualFeeMonth: 3, color: "#112233", benefits: ["LoungeKey", "LoungeKey", "Seguro viagem"], tags: ["viagem", " viagem "], notes: "principal" });
    expect(c.status).toBe(201);
    const id = c.data.item.id;
    const row = await prisma.creditCard.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ bank: "Itaú", last4: "1234", printedName: "ANA SILVA", status: "ACTIVE", expMonth: 8, expYear: 2030, limitCents: 2000000, color: "#112233", benefits: ["LoungeKey", "Seguro viagem"], tags: ["viagem"] });
    // nunca o número completo
    expect((await a.call(cards.POST, "POST", "/c", { ...base, accountId: accA, last4: "1234567812345678" })).status).toBe(400);
    expect((await a.call(card.PUT, "PUT", "/c", { ...base, accountId: accA, status: "BLOCKED" }, { id })).status).toBe(200);
    const d = (await a.call(detail.GET, "GET", "/x", undefined, { id })).data;
    expect(d.activity.map((x: { text: string }) => x.text)).toEqual(["Situação: Ativo → Bloqueado", "Cartão cadastrado"]);
    // outro usuário não vê
    expect((await b.call(detail.GET, "GET", "/x", undefined, { id })).status).toBe(404);
    expect((await b.call(comments.POST, "POST", "/x", { text: "oi" }, { id })).status).toBe(404);
  });

  it("lembretes e comentários do cartão; excluir o cartão leva tudo junto", async () => {
    const id = (await a.call(cards.POST, "POST", "/c", { ...base, accountId: accA })).data.item.id;
    const r = await a.call(reminders.POST, "POST", "/x", { kind: "DUE", title: "Pagar a fatura", date: "2026-11-10", recurrence: "MONTHLY", advanceDays: 3, whatsapp: true }, { id });
    expect(r.status).toBe(201);
    expect((await a.call(reminders.POST, "POST", "/x", { kind: "DUE", title: "", date: "2026-11-10" }, { id })).status).toBe(400);
    expect((await b.call(reminders.POST, "POST", "/x", { kind: "DUE", title: "x", date: "2026-11-10" }, { id })).status).toBe(404);
    expect((await a.call(comments.POST, "POST", "/x", { text: "Pedir aumento de limite" }, { id })).status).toBe(201);
    let d = (await a.call(detail.GET, "GET", "/x", undefined, { id })).data;
    expect(d.reminders).toMatchObject([{ title: "Pagar a fatura", date: "2026-11-10", recurrence: "MONTHLY", advanceDays: 3, whatsapp: true }]);
    expect(d.activity[0]).toMatchObject({ kind: "COMMENT", text: "Pedir aumento de limite" });
    expect(await upcomingCardReminders(userA, "2026-11-03")).toMatchObject([{ title: "Pagar a fatura", card: "Black da Ana", late: false }]);
    expect(await upcomingCardReminders(userA, "2026-12-20")).toMatchObject([{ late: true }]);
    expect((await b.call(reminder.DELETE, "DELETE", "/x", undefined, { id, rid: r.data.id })).status).toBe(404);
    expect((await a.call(reminder.DELETE, "DELETE", "/x", undefined, { id, rid: r.data.id })).status).toBe(200);
    d = (await a.call(detail.GET, "GET", "/x", undefined, { id })).data;
    expect(d.reminders).toEqual([]);
    expect((await a.call(card.DELETE, "DELETE", "/x", undefined, { id })).status).toBe(200);
    expect(await prisma.cardActivity.count({ where: { cardId: id } })).toBe(0);
  });

  it("sugere data e recorrência dos lembretes rápidos", () => {
    const c = { name: "Black", dueDay: 10, closingDay: 3, annualFeeMonth: 3, expMonth: 2, expYear: 2030 };
    expect(quickReminder("DUE", c, "2026-11-03")).toMatchObject({ date: "2026-11-10", recurrence: "MONTHLY", title: "Vencimento da fatura · Black" });
    expect(quickReminder("CLOSING", c, "2026-11-05")).toMatchObject({ date: "2026-12-03", recurrence: "MONTHLY" });
    expect(quickReminder("ANNUAL_FEE", c, "2026-11-03")).toMatchObject({ date: "2027-03-01", recurrence: "YEARLY" });
    expect(quickReminder("EXPIRY", c, "2026-11-03")).toMatchObject({ date: "2030-02-28", recurrence: "NONE" });
    expect(nextDayOfMonth(31, "2026-02-10")).toBe("2026-02-28");
    expect(nextReminderDate("2026-01-31", "MONTHLY")).toBe("2026-02-28");
    expect(nextReminderDate("2026-01-31", "NONE")).toBeNull();
  });
});
