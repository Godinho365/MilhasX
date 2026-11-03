// Equipe (membros, tarefas, metas, processos) e contatos (passageiros, interesses de viagem), isolados por usuário.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client, seedPrograms } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as accounts from "@/app/api/accounts/route";
import * as entries from "@/app/api/entries/route";
import * as sales from "@/app/api/sales/route";
import * as members from "@/app/api/team/members/route";
import * as member from "@/app/api/team/members/[id]/route";
import * as tasks from "@/app/api/tasks/route";
import * as task from "@/app/api/tasks/[id]/route";
import * as taskMove from "@/app/api/tasks/[id]/move/route";
import * as goals from "@/app/api/goals/route";
import * as keyResult from "@/app/api/key-results/[id]/route";
import * as processes from "@/app/api/processes/route";
import * as processRun from "@/app/api/processes/[id]/run/route";
import * as passengers from "@/app/api/passengers/route";
import * as passenger from "@/app/api/passengers/[id]/route";
import * as passengerImport from "@/app/api/passengers/import/route";
import * as interests from "@/app/api/interests/route";
import * as interestStatus from "@/app/api/interests/[id]/status/route";
import { listGoals, listTasks, periodStart, periodEnd } from "@/server/services/team";
import { listPassengers } from "@/server/services/contacts";
import { prisma } from "@/server/db";

let c: Client;
let o: Client;
let userId: string;
beforeEach(async () => {
  await resetDb();
  await seedPrograms();
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  o = new Client();
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
});

describe("períodos das metas", () => {
  it("início e fim do mês, trimestre e ano", () => {
    const d = new Date("2026-11-15T00:00:00Z");
    expect(periodStart("MONTH", d).toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(periodStart("QUARTER", d).toISOString().slice(0, 10)).toBe("2026-10-01");
    expect(periodStart("YEAR", d).toISOString().slice(0, 10)).toBe("2026-01-01");
    expect(periodEnd("QUARTER", periodStart("QUARTER", d)).toISOString().slice(0, 10)).toBe("2027-01-01");
  });
});

describe("equipe e tarefas", () => {
  it("membro como responsável; tarefa muda de coluna e marca quando terminou; isolado", async () => {
    const m = (await c.call(members.POST, "POST", "/x", { name: "Bia", role: "Emissora", email: "Bia@X.test" })).data.id;
    expect((await c.call(members.GET, "GET", "/x")).data.items[0]).toMatchObject({ name: "Bia", email: "bia@x.test", openTasks: 0 });
    const t = (await c.call(tasks.POST, "POST", "/x", { title: "Emitir pedido 12", priority: "HIGH", memberId: m, dueDate: "2026-11-10" })).data.id;
    expect((await c.call(members.GET, "GET", "/x")).data.items[0].openTasks).toBe(1);
    expect((await c.call(taskMove.POST, "POST", "/x", { status: "DONE" }, { id: t })).status).toBe(200);
    const [done] = await listTasks(userId);
    expect(done).toMatchObject({ status: "DONE", member: "Bia" });
    expect(done!.doneAt).not.toBeNull();
    // outro usuário não vê, não usa o membro, não mexe na tarefa
    expect((await o.call(tasks.GET, "GET", "/x")).data.items).toHaveLength(0);
    expect((await o.call(tasks.POST, "POST", "/x", { title: "x", priority: "LOW", memberId: m })).status).toBe(404);
    expect((await o.call(task.DELETE, "DELETE", "/x", undefined, { id: t })).status).toBe(404);
    expect((await o.call(member.DELETE, "DELETE", "/x", undefined, { id: m })).status).toBe(404);
    // tirar o membro deixa a tarefa sem responsável
    await c.call(member.DELETE, "DELETE", "/x", undefined, { id: m });
    expect((await listTasks(userId))[0]!.memberId).toBeNull();
  });

  it("processo usado vira uma tarefa por etapa", async () => {
    const p = (await c.call(processes.POST, "POST", "/x", { title: "Reembolso", steps: [{ title: "Conferir prazo" }, { title: "Cancelar na companhia", detail: "no site" }, { title: "  " }] })).data.id;
    const r = await c.call(processRun.POST, "POST", "/x", { label: "Pedido 7" }, { id: p });
    expect([r.status, r.data.created]).toEqual([201, 2]);
    expect((await listTasks(userId)).map((t) => t.title)).toEqual(["Pedido 7 · Conferir prazo", "Pedido 7 · Cancelar na companhia"]);
    expect((await o.call(processRun.POST, "POST", "/x", {}, { id: p })).status).toBe(404);
  });
});

describe("metas", () => {
  it("resultado medido pelas vendas do período e check-in do manual", async () => {
    const p = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
    const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
    const acc = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.id })).data.item.id;
    await c.call(entries.POST, "POST", "/e", { accountId: acc, type: "PURCHASE", points: 20000, occurredAt: "2026-11-01", costs: [{ type: "PONTOS", amountCents: 50000 }] });
    await c.call(sales.POST, "POST", "/s", { origin: "OWN", accountId: acc, occurredAt: "2026-11-05", items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 10000, salePriceCents: 30000, passengers: 1 }] });
    const g = await c.call(goals.POST, "POST", "/x", { title: "Crescer", period: "MONTH", start: "2026-11-20", keyResults: [
      { title: "Faturar R$ 1.000", metric: "REVENUE", target: 100000 },
      { title: "Vendas", metric: "SALES", target: 4 },
      { title: "Posts no Instagram", metric: "MANUAL", target: 10 },
    ] });
    expect(g.status).toBe(201);
    let [goal] = await listGoals(userId, "MONTH", new Date("2026-11-01T00:00:00Z"));
    expect(goal!.keyResults.map((k) => [k.current, k.progress])).toEqual([[30000, 30], [1, 25], [0, 0]]);
    const manual = goal!.keyResults[2]!;
    expect((await c.call(keyResult.POST, "POST", "/x", { current: 5 }, { id: manual.id })).status).toBe(200);
    expect((await c.call(keyResult.POST, "POST", "/x", { current: 5 }, { id: goal!.keyResults[0]!.id })).status).toBe(409); // medido sozinho
    expect((await o.call(keyResult.POST, "POST", "/x", { current: 9 }, { id: manual.id })).status).toBe(404);
    [goal] = await listGoals(userId, "MONTH", new Date("2026-11-01T00:00:00Z"));
    expect(goal!.keyResults[2]!.progress).toBe(50);
    expect(goal!.progress).toBe(Math.round((30 + 25 + 50) / 3));
  });
});

describe("contatos", () => {
  it("passageiro com CPF único; importa os CPFs já emitidos; aniversário do mês", async () => {
    const r = await c.call(passengers.POST, "POST", "/x", { name: "Maria Silva", cpf: "123.456.789-01", birthDate: "1990-11-20" });
    expect(r.status).toBe(201);
    expect((await c.call(passengers.POST, "POST", "/x", { name: "Outra", cpf: "12345678901" })).status).toBe(409);
    expect((await c.call(passengers.POST, "POST", "/x", { name: "Curto", cpf: "123" })).status).toBe(400);
    const p = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
    const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
    const acc = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.id })).data.item.id;
    await prisma.accountBeneficiary.createMany({ data: [
      { userId, accountId: acc, name: "Maria Silva", document: "12345678901", usedAt: new Date("2026-10-01") },
      { userId, accountId: acc, name: "João Souza", document: "98765432100", usedAt: new Date("2026-10-02") },
    ] });
    expect((await c.call(passengerImport.POST, "POST", "/x")).data.created).toBe(1); // Maria já estava
    const list = await listPassengers(userId, {}, new Date("2026-11-15T12:00:00Z"));
    expect(list.items.map((i) => i.name)).toEqual(["João Souza", "Maria Silva"]);
    expect(list.items.find((i) => i.name === "Maria Silva")).toMatchObject({ birthdayMonth: true, birthdaySoon: true, lastUse: { date: "2026-10-01" } });
    expect(list.totals).toMatchObject({ total: 2, withCpf: 2, birthdayMonth: 1 });
    expect((await o.call(passenger.DELETE, "DELETE", "/x", undefined, { id: r.data.id })).status).toBe(404);
  });

  it("interesse de viagem: cliente avulso, situação e data da oferta enviada", async () => {
    expect((await c.call(interests.POST, "POST", "/x", { destination: "Lisboa", priority: "HIGH", status: "NEW" })).status).toBe(400); // sem cliente
    const id = (await c.call(interests.POST, "POST", "/x", { customerName: "Maria", origin: "gru", destination: "Lisboa", month: "2027-05", priority: "HIGH", status: "NEW", programs: ["LATAM Pass"] })).data.id;
    expect((await c.call(interestStatus.POST, "POST", "/x", { status: "OFFER_SENT" }, { id })).status).toBe(200);
    const [i] = (await c.call(interests.GET, "GET", "/api/interests?status=OFFER_SENT")).data.items;
    expect(i).toMatchObject({ customerName: "Maria", origin: "GRU", destination: "Lisboa", month: "2027-05", status: "OFFER_SENT" });
    expect(i.offerSentAt).not.toBeNull();
    expect((await o.call(interests.GET, "GET", "/x")).data.items).toHaveLength(0);
    expect((await o.call(interestStatus.POST, "POST", "/x", { status: "LOST" }, { id })).status).toBe(404);
  });
});
