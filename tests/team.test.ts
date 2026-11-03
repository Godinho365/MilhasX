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
import * as assign from "@/app/api/tasks/[id]/assign/route";
import * as checklist from "@/app/api/tasks/[id]/checklist/route";
import * as comments from "@/app/api/tasks/[id]/comments/route";
import * as boards from "@/app/api/task-boards/route";
import { columnOf } from "@/domain/team";
import * as board from "@/app/api/task-boards/[id]/route";
import * as partners from "@/app/api/partners/route";
import * as salePartner from "@/app/api/sales/[id]/partner/route";
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
    const t = (await c.call(tasks.POST, "POST", "/x", { title: "Emitir pedido 12", priority: "HIGH", memberIds: [m], dueDate: "2026-11-10" })).data.id;
    expect((await c.call(members.GET, "GET", "/x")).data.items[0].openTasks).toBe(1);
    expect((await c.call(taskMove.POST, "POST", "/x", { status: "DONE" }, { id: t })).status).toBe(200);
    const [done] = await listTasks(userId);
    expect(done).toMatchObject({ status: "DONE", members: [{ name: "Bia" }] });
    expect(done!.doneAt).not.toBeNull();
    // outro usuário não vê, não usa o membro, não mexe na tarefa
    expect((await o.call(tasks.GET, "GET", "/x")).data.items).toHaveLength(0);
    expect((await o.call(tasks.POST, "POST", "/x", { title: "x", priority: "LOW", memberIds: [m] })).status).toBe(404);
    expect((await o.call(task.DELETE, "DELETE", "/x", undefined, { id: t })).status).toBe(404);
    expect((await o.call(member.DELETE, "DELETE", "/x", undefined, { id: m })).status).toBe(404);
    // tirar o membro tira ele das tarefas
    await c.call(member.DELETE, "DELETE", "/x", undefined, { id: m });
    expect((await listTasks(userId))[0]!.memberIds).toEqual([]);
  });

  it("processo usado vira uma tarefa por etapa", async () => {
    const p = (await c.call(processes.POST, "POST", "/x", { title: "Reembolso", steps: [{ title: "Conferir prazo" }, { title: "Cancelar na companhia", detail: "no site" }, { title: "  " }] })).data.id;
    const r = await c.call(processRun.POST, "POST", "/x", { label: "Pedido 7" }, { id: p });
    expect([r.status, r.data.created]).toEqual([201, 2]);
    expect((await listTasks(userId)).map((t) => t.title)).toEqual(["Pedido 7 · Conferir prazo", "Pedido 7 · Cancelar na companhia"]);
    expect((await o.call(processRun.POST, "POST", "/x", {}, { id: p })).status).toBe(404);
  });
});

describe("quadro de tarefas como no Volly", () => {
  it("quadros, vários membros, checklist, comentários, horário e a próxima recorrência ao concluir", async () => {
    const [equipe] = (await c.call(boards.GET, "GET", "/x")).data.items;
    expect(equipe.name).toBe("Equipe");
    const outro = (await c.call(boards.POST, "POST", "/x", { name: "Financeiro" })).data.id;
    const a = (await c.call(members.POST, "POST", "/x", { name: "Ana" })).data.id;
    const b = (await c.call(members.POST, "POST", "/x", { name: "Bruno", issuer: true })).data.id;
    expect((await c.call(tasks.POST, "POST", "/x", { title: "x", priority: "LOW", dueDate: "2026-11-10", dueTime: "25:00" })).status).toBe(400);
    const id = (await c.call(tasks.POST, "POST", "/x", { boardId: outro, title: "Pagar ISS", priority: "URGENT", memberIds: [a, b], dueDate: "2026-01-31", dueTime: "09:30", recurrence: "MONTHLY", checklist: [{ text: "Gerar guia", done: false }, { text: " ", done: false }] })).data.id;
    let [t] = await listTasks(userId, { boardId: outro });
    expect(t).toMatchObject({ title: "Pagar ISS", dueTime: "09:30", recurrence: "MONTHLY", checklist: [{ text: "Gerar guia", done: false }] });
    expect(t!.members.map((m) => m.name)).toEqual(["Ana", "Bruno"]);
    expect(await listTasks(userId, { boardId: equipe.id })).toHaveLength(0);
    expect(await listTasks(userId, { memberId: b })).toHaveLength(1);

    expect((await c.call(checklist.POST, "POST", "/x", { index: 0, done: true }, { id })).status).toBe(200);
    expect((await c.call(comments.POST, "POST", "/x", { text: "Guia gerada" }, { id })).status).toBe(201);
    // concluir a recorrente cria a próxima no mês seguinte (31/01 → 28/02), com o checklist desmarcado
    await c.call(taskMove.POST, "POST", "/x", { status: "DONE" }, { id });
    const all = await listTasks(userId, { boardId: outro });
    const next = all.find((x) => x.id !== id)!;
    expect(next).toMatchObject({ status: "TODO", dueDate: "2026-02-28", dueTime: "09:30", checklist: [{ text: "Gerar guia", done: false }] });
    const d = (await c.call(task.GET, "GET", "/x", undefined, { id })).data;
    expect(d.comments.map((x: { kind: string; text: string }) => [x.kind, x.text])).toEqual(expect.arrayContaining([["COMMENT", "Guia gerada"], ["ACTIVITY", "Pendente → Concluída"], ["ACTIVITY", "Tarefa criada"]]));
    // arrastar para a coluna de outra pessoa passa a tarefa para ela
    expect((await c.call(assign.POST, "POST", "/x", { memberId: a }, { id: next.id })).status).toBe(200);
    expect((await listTasks(userId, { memberId: b })).map((x) => x.id)).toEqual([id]);
    // isolado
    expect((await o.call(task.GET, "GET", "/x", undefined, { id })).status).toBe(404);
    expect((await o.call(comments.POST, "POST", "/x", { text: "oi" }, { id })).status).toBe(404);
    expect((await o.call(board.DELETE, "DELETE", "/x", undefined, { id: outro })).status).toBe(404);
    // quadro excluído leva as tarefas; o último quadro não sai
    expect((await c.call(board.DELETE, "DELETE", "/x", undefined, { id: outro })).status).toBe(200);
    expect(await prisma.task.count({ where: { userId } })).toBe(0);
    expect((await c.call(board.DELETE, "DELETE", "/x", undefined, { id: equipe.id })).status).toBe(409);
  });
});

describe("novo quadro: colunas e acesso", () => {
  it("modelo básico, customizado e em branco; arrastar entre colunas muda a situação; restrito guarda os membros", async () => {
    const ana = (await c.call(members.POST, "POST", "/x", { name: "Ana" })).data.id;
    const basico = (await c.call(boards.POST, "POST", "/x", { name: "Básico" })).data.id;
    const custom = (await c.call(boards.POST, "POST", "/x", { name: "Emissões", description: "Fluxo de emissão", columns: [{ name: "Recebido" }, { name: "Cotando" }, { name: "Emitindo" }, { name: "Entregue" }], restricted: true, memberIds: [ana] })).data.id;
    const vazio = (await c.call(boards.POST, "POST", "/x", { name: "Vazio", columns: [] })).data.id;
    const list = (await c.call(boards.GET, "GET", "/x")).data.items as { id: string; columns: { id: string; name: string }[]; restricted: boolean; memberIds: string[]; description: string | null }[];
    expect(list.find((b) => b.id === basico)!.columns.map((x) => x.name)).toEqual(["A fazer", "Em andamento", "Concluído"]);
    const cb = list.find((b) => b.id === custom)!;
    expect(cb).toMatchObject({ description: "Fluxo de emissão", restricted: true, memberIds: [ana] });
    expect(cb.columns.map((x) => x.name)).toEqual(["Recebido", "Cotando", "Emitindo", "Entregue"]);
    expect(list.find((b) => b.id === vazio)!.columns).toEqual([]);
    expect((await c.call(boards.POST, "POST", "/x", { name: "X", restricted: true, memberIds: ["naoexiste"] })).status).toBe(404);

    const [rec, cot, emi, ent] = cb.columns.map((x) => x.id);
    const id = (await c.call(tasks.POST, "POST", "/x", { boardId: custom, title: "Emitir GRU", priority: "LOW", columnId: cot })).data.id;
    expect((await listTasks(userId, { boardId: custom }))[0]).toMatchObject({ status: "DOING", columnId: cot });
    await c.call(taskMove.POST, "POST", "/x", { columnId: emi }, { id });
    expect((await listTasks(userId, { boardId: custom }))[0]).toMatchObject({ status: "DOING", columnId: emi });
    await c.call(taskMove.POST, "POST", "/x", { columnId: ent }, { id });
    expect((await listTasks(userId, { boardId: custom }))[0]).toMatchObject({ status: "DONE", columnId: ent });
    // reabrir pelo círculo volta para a primeira coluna (pela situação)
    await c.call(taskMove.POST, "POST", "/x", { status: "TODO" }, { id });
    expect((await listTasks(userId, { boardId: custom }))[0]).toMatchObject({ status: "TODO", columnId: null });
    expect(columnOf(cb.columns, { status: "TODO", columnId: null })).toBe(rec);
    // coluna de outro quadro não vale
    expect((await c.call(taskMove.POST, "POST", "/x", { columnId: "done" }, { id })).status).toBe(400);
    // editar o quadro: renomear coluna mantém a tarefa nela; quadro de outro usuário não
    await c.call(taskMove.POST, "POST", "/x", { columnId: cot }, { id });
    expect((await c.call(board.PUT, "PUT", "/x", { name: "Emissões", columns: [{ id: rec, name: "Entrada" }, { id: cot, name: "Em cotação" }, { id: ent, name: "Entregue" }] }, { id: custom })).status).toBe(200);
    expect((await listTasks(userId, { boardId: custom }))[0]!.columnId).toBe(cot);
    expect((await o.call(board.PUT, "PUT", "/x", { name: "hack" }, { id: custom })).status).toBe(404);
  });
});

describe("parceiros e comissão na venda", () => {
  it("comissão pela regra do parceiro sai do lucro e é recalculada ao trocar o parceiro", async () => {
    const p = await prisma.program.findFirstOrThrow({ where: { code: "LATAM" } });
    const h = (await c.call(holders.POST, "POST", "/h", { name: "Ana" })).data.item.id;
    const acc = (await c.call(accounts.POST, "POST", "/a", { holderId: h, programId: p.id })).data.item.id;
    await c.call(entries.POST, "POST", "/e", { accountId: acc, type: "PURCHASE", points: 20000, occurredAt: "2026-11-01", costs: [{ type: "PONTOS", amountCents: 50000 }] });
    // 10 mil pontos (custo R$ 250) vendidos por R$ 300 → lucro R$ 50
    const sale = (await c.call(sales.POST, "POST", "/s", { origin: "OWN", accountId: acc, occurredAt: "2026-11-05", items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 10000, salePriceCents: 30000, passengers: 1 }] })).data.item.id;
    const pct = (await c.call(partners.POST, "POST", "/x", { name: "Agência X", mode: "PROFIT_PCT", value: 1000 })).data.id; // 10% do lucro
    const fixed = (await c.call(partners.POST, "POST", "/x", { name: "Indicador", mode: "FIXED", value: 2000 })).data.id; // R$ 20
    expect((await c.call(partners.POST, "POST", "/x", { name: "Errado", mode: "SALE_PCT", value: 15000 })).status).toBe(400);
    let r = await c.call(salePartner.POST, "POST", "/x", { partnerId: pct }, { id: sale });
    expect(r.data.item).toMatchObject({ resultCents: 4500, partner: { name: "Agência X", commissionCents: 500 } });
    r = await c.call(salePartner.POST, "POST", "/x", { partnerId: fixed }, { id: sale });
    expect(r.data.item).toMatchObject({ resultCents: 3000, partner: { commissionCents: 2000 } });
    expect((await c.call(partners.GET, "GET", "/x")).data.items.find((x: { id: string }) => x.id === fixed)).toMatchObject({ sales: 1, commissionCents: 2000 });
    r = await c.call(salePartner.POST, "POST", "/x", { partnerId: null }, { id: sale });
    expect(r.data.item).toMatchObject({ resultCents: 5000, partner: null });
    expect((await o.call(salePartner.POST, "POST", "/x", { partnerId: null }, { id: sale })).status).toBe(404);
    expect((await o.call(salePartner.POST, "POST", "/x", { partnerId: pct }, { id: sale })).status).toBe(404);
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
