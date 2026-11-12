// Processos em fluxograma: a limpeza do que chega (ids, tipos, ligações, links), a ordem de execução com decisões
// e voltas, a lista antiga virando fluxograma, a organização automática, os modelos, o texto para a IA; as rotas
// (salvar com fluxograma, usar, permissões) e a IA (perguntar e gerar) com o cliente da Anthropic simulado.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetDb, Client } from "./helpers";
import { prisma } from "@/server/db";
import {
  cleanFlow, executionOrder, stepsOf, flowFromSteps, layoutFlow, flowText, flowBounds, newId, buildFlow, TEMPLATES, FlowError, NODE_KINDS,
  type Flow,
} from "@/domain/process-flow";
import { apiRequirement } from "@/domain/permissions";
import { listProcesses, listTasks } from "@/server/services/team";
import * as register from "@/app/api/auth/register/route";
import * as processes from "@/app/api/processes/route";
import * as processRoute from "@/app/api/processes/[id]/route";
import * as processRun from "@/app/api/processes/[id]/run/route";
import * as askRoute from "@/app/api/processes/ask/route";
import * as generateRoute from "@/app/api/processes/generate/route";
import * as members from "@/app/api/team/members/route";
import * as inviteRoute from "@/app/api/team/members/[id]/invite/route";
import * as acceptRoute from "@/app/api/auth/invite/[token]/route";

const ai = vi.hoisted(() => ({ enabled: true, calls: [] as Record<string, unknown>[], reply: null as unknown, error: null as unknown }));
vi.mock("@/server/ai", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/server/ai")>();
  const call = async (p: Record<string, unknown>) => { ai.calls.push(p); if (ai.error) throw ai.error; return ai.reply; };
  return { ...mod, aiEnabled: () => ai.enabled, aiClient: () => ({ beta: { messages: { create: call, parse: call } } }) };
});

const node = (id: string, kind: string, title = id, extra: object = {}) => ({ id, kind, x: 0, y: 0, title, ...extra });
const edge = (from: string, to: string, label?: string) => ({ from, to, label });

describe("fluxograma", () => {
  it("limpa: id e tipo válidos, sem repetir, textos no limite, link só do app; ligações só entre caixas que existem", () => {
    const f = cleanFlow({
      nodes: [
        node("a", "start", "  Começo  "), node("a", "step"), node("b", "step", "x".repeat(300), { owner: "Emissor", link: "javascript:alert(1)" }),
        node("c", "decision", "", { link: "/app/sales?edit=1" }), node("n", "note", "Atenção", { owner: "não fica" }), node("bad id!", "step"), node("z", "circle"),
        node("e", "end"),
      ],
      edges: [edge("a", "b"), edge("a", "b"), edge("b", "b"), edge("b", "c", "  ok  "), edge("c", "x"), edge("n", "b"), edge("e", "a"), edge("b", "a")],
    });
    expect(f.nodes.map((n) => [n.id, n.kind, n.title.length > 20 ? n.title.length : n.title, n.owner, n.link])).toEqual([
      ["a", "start", "Começo", null, null], ["b", "step", 200, "Emissor", null], ["c", "decision", "Decisão", null, "/app/sales?edit=1"],
      ["n", "note", "Atenção", null, null], ["e", "end", "e", null, null],
    ]);
    // sem repetir, sem laço, sem nota, fim sem saída, início sem entrada
    expect(f.edges.map((e) => [e.from, e.to, e.label])).toEqual([["a", "b", null], ["b", "c", "ok"]]);
    expect(() => cleanFlow({ nodes: Array.from({ length: 151 }, (_, i) => node(`n${i}`, "step")), edges: [] })).toThrow(FlowError);
    expect(cleanFlow(null)).toEqual({ nodes: [], edges: [] });
  });

  it("ordem de execução: em largura do início, decisão com os dois caminhos, volta sem repetir, solto no fim", () => {
    const f = cleanFlow({
      nodes: [
        { ...node("i", "start"), y: 0 }, { ...node("a", "step", "Cotar"), y: 100 }, { ...node("d", "decision", "Aprovou?"), y: 200 },
        { ...node("s", "step", "Cobrar"), y: 300, x: 0 }, { ...node("n", "step", "Ajustar"), y: 300, x: 300, owner: "Atendimento" }, { ...node("f", "end"), y: 400 },
        { ...node("solta", "step", "Arquivar"), y: 50, x: 900 }, node("nota", "note", "Lembrete"),
      ],
      edges: [edge("i", "a"), edge("a", "d"), edge("d", "s", "Sim"), edge("d", "n", "Não"), edge("n", "a"), edge("s", "f")],
    });
    expect(executionOrder(f).map((n) => n.id)).toEqual(["a", "d", "s", "n", "solta"]);
    expect(stepsOf(f)).toEqual([
      { title: "Cotar", detail: null },
      { title: "Decidir: Aprovou?", detail: "Sim → Cobrar · Não → Ajustar" },
      { title: "Cobrar", detail: null },
      { title: "Ajustar", detail: "Responsável: Atendimento" },
      { title: "Arquivar", detail: null },
    ]);
  });

  it("lista antiga vira fluxograma; organizar põe em camadas sem a volta empurrar; modelos, texto e utilitários", () => {
    const old = flowFromSteps([{ title: "Conferir prazo" }, { title: "Cancelar", detail: "no site" }]);
    expect(old.nodes.map((n) => n.kind)).toEqual(["start", "step", "step", "end"]);
    expect(stepsOf(old)).toEqual([{ title: "Conferir prazo", detail: null }, { title: "Cancelar", detail: "no site" }]);

    const f = layoutFlow(cleanFlow({
      nodes: [node("i", "start"), node("a", "step"), node("d", "decision"), node("s", "step"), node("n", "step"), node("f", "end")],
      edges: [edge("i", "a"), edge("a", "d"), edge("d", "s"), edge("d", "n"), edge("n", "a"), edge("s", "f")],
    }));
    const y = Object.fromEntries(f.nodes.map((n) => [n.id, n.y]));
    expect(y).toEqual({ i: 0, a: 150, d: 300, s: 450, n: 450, f: 600 }); // a volta n → a não desce o "a"
    const xs = f.nodes.filter((n) => n.id === "s" || n.id === "n").map((n) => n.x + NODE_KINDS[n.kind].w / 2);
    expect(Math.abs(xs[0]! - xs[1]!)).toBe(270);

    for (const t of TEMPLATES) {
      const tf = t.flow();
      expect(tf.nodes.length, t.title).toBeGreaterThan(5);
      expect(tf.edges.length, t.title).toBeGreaterThan(5);
      expect(stepsOf(tf).length, t.title).toBeGreaterThan(3);
      expect(cleanFlow(tf), t.title).toEqual(tf); // modelo já vem limpo
    }
    const text = flowText({ title: "Reembolso", description: "Desistência", flow: TEMPLATES[1]!.flow() });
    expect(text).toContain("## Reembolso");
    expect(text).toContain("Decisão: Está dentro das 24 horas?");
    expect(text).toMatch(/- Sim: Cancelar a emissão/);
    expect(text).toContain("responsável: Financeiro");
    expect(newId({ nodes: [node("n3", "step") as never], edges: [] })).toBe("n2");
    expect(flowBounds({ nodes: [], edges: [] })).toEqual({ x: 0, y: 0, w: 800, h: 500 });
    const built = buildFlow([{ key: "x", kind: "start", title: "A" }, { key: "y", kind: "end", title: "B" }], [["x", "y"], ["x", "zz"]]);
    expect(built.edges).toHaveLength(1);
  });
});

describe("permissões", () => {
  it("perguntar à IA é ver; gerar, salvar e usar é editar", () => {
    expect(apiRequirement("/api/processes/ask", "POST")).toEqual({ area: "tarefas", level: "view" });
    expect(apiRequirement("/api/processes/generate", "POST")).toEqual({ area: "tarefas", level: "edit" });
    expect(apiRequirement("/api/processes", "POST")).toEqual({ area: "tarefas", level: "edit" });
  });
});

/* ---------------- Rotas ---------------- */

let c: Client, o: Client, userId: string;
beforeEach(async () => {
  await resetDb();
  ai.enabled = true; ai.calls.length = 0; ai.reply = null; ai.error = null;
  c = new Client();
  userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  o = new Client();
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
});
async function join(memberId: string, role: string) {
  const inv = await c.call(inviteRoute.POST, "POST", `/api/team/members/${memberId}/invite`, { role }, { id: memberId });
  expect(inv.status).toBe(201);
  const m = new Client();
  expect((await m.call(acceptRoute.POST, "POST", "/api/auth/invite/x", { name: "Membro", password: "senha-do-membro-1" }, { token: inv.data.item.link.split("/convite/")[1] })).status).toBe(201);
  return m;
}

describe("salvar e usar", () => {
  it("salva o fluxograma, guarda as etapas na ordem, usa (tarefas na ordem) e edita; lista antiga continua", async () => {
    const flow: Flow = TEMPLATES[0]!.flow();
    const r = await c.call(processes.POST, "POST", "/x", { title: "Emissão", description: "Do pedido à reserva", flow });
    expect(r.status).toBe(201);
    const id = r.data.id as string;
    const [p] = await listProcesses(userId);
    expect(p!.flow).toEqual(flow);
    expect(p!.steps.map((s) => s.title)).toEqual(stepsOf(flow).map((s) => s.title));
    const run = await c.call(processRun.POST, "POST", "/x", { label: "Pedido 9" }, { id });
    expect(run.data.created).toBe(stepsOf(flow).length);
    expect((await listTasks(userId)).map((t) => t.title).slice(0, 3)).toEqual(["Pedido 9 · Confirmar trecho, datas e passageiros", "Pedido 9 · Buscar a melhor opção", "Pedido 9 · Enviar a cotação"]);

    // edita: só início e fim → sem etapa, recusa
    const bad = await c.call(processRoute.PUT, "PUT", "/x", { title: "Emissão", flow: { nodes: [node("i", "start"), node("f", "end")], edges: [edge("i", "f")] } }, { id });
    expect([bad.status, bad.data.erro]).toEqual([400, "Inclua ao menos uma etapa no fluxograma"]);
    expect((await c.call(processes.POST, "POST", "/x", { title: "Grande", flow: { nodes: Array.from({ length: 151 }, (_, i) => node(`n${i}`, "step")), edges: [] } })).status).toBe(400);
    expect((await c.call(processRoute.PUT, "PUT", "/x", { title: "Emissão 2", flow: { nodes: [node("i", "start"), node("a", "step", "Única")], edges: [edge("i", "a")] } }, { id })).status).toBe(200);
    expect((await listProcesses(userId))[0]).toMatchObject({ title: "Emissão 2", steps: [{ title: "Única", detail: null }] });
    expect((await o.call(processRoute.PUT, "PUT", "/x", { title: "x", flow }, { id })).status).toBe(404);

    // jeito antigo (só etapas): o fluxograma é montado na leitura
    await c.call(processes.POST, "POST", "/x", { title: "Antigo", steps: [{ title: "Passo 1" }, { title: "Passo 2" }] });
    const antigo = (await listProcesses(userId)).find((x) => x.title === "Antigo")!;
    expect(antigo.flow.nodes.map((n) => n.kind)).toEqual(["start", "step", "step", "end"]);
    expect((await prisma.process.findFirstOrThrow({ where: { title: "Antigo" } })).flow).toBeNull();
    expect((await c.call(processes.POST, "POST", "/x", { title: "Vazio" })).status).toBe(400);
  });
});

describe("IA", () => {
  it("pergunta: lê os processos (com cache), usa o modelo com fallback, responde; desligada e limite", async () => {
    await c.call(processes.POST, "POST", "/x", { title: "Reembolso", flow: TEMPLATES[1]!.flow() });
    ai.reply = { stop_reason: "end_turn", content: [{ type: "text", text: "No processo Reembolso, o Financeiro devolve o valor." }] };
    const r = await c.call(askRoute.POST, "POST", "/x", { question: "Quem devolve o dinheiro?", history: [{ role: "user", content: "oi" }, { role: "assistant", content: "Olá" }] });
    expect(r.status).toBe(200);
    expect(r.data).toMatchObject({ answer: "No processo Reembolso, o Financeiro devolve o valor.", processes: 1 });
    const call = ai.calls[0] as { model: string; fallbacks: string; betas: string[]; system: { text: string; cache_control?: object }[]; messages: { content: string }[]; output_config: { effort: string } };
    expect(call.model).toBe("claude-opus-5-5");
    expect([call.fallbacks, call.betas]).toEqual(["default", ["server-side-fallback-2026-07-01"]]);
    expect(call.output_config.effort).toBe("low");
    expect(call.system[1]!.text).toContain("Decisão: Está dentro das 24 horas?");
    expect(call.system[1]!.cache_control).toEqual({ type: "ephemeral" });
    expect(call.messages.map((m) => m.content)).toEqual(["oi", "Olá", "Quem devolve o dinheiro?"]);
    // outra conta não lê os processos daqui
    await o.call(askRoute.POST, "POST", "/x", { question: "Quem devolve?" });
    expect((ai.calls[1] as { system: { text: string }[] }).system[1]!.text).toContain("ainda não cadastrou nenhum processo");

    ai.reply = { stop_reason: "refusal", content: [] };
    expect((await c.call(askRoute.POST, "POST", "/x", { question: "x?y" })).data.answer).toBe("Não consigo ajudar com essa pergunta.");
    expect((await c.call(askRoute.POST, "POST", "/x", { question: "?" })).status).toBe(400);
    ai.enabled = false;
    expect((await c.call(askRoute.POST, "POST", "/x", { question: "Quem faz?" })).status).toBe(503);
    ai.enabled = true;
    await prisma.auditLog.createMany({ data: Array.from({ length: 30 }, () => ({ actorId: userId, action: "processes.ask", targetType: "Process" })) });
    expect((await c.call(askRoute.POST, "POST", "/x", { question: "Quem faz?" })).status).toBe(429);
  });

  it("gera: saída estruturada vira fluxograma organizado (ids, ligações e links conferidos); recusa e resposta vazia", async () => {
    ai.reply = {
      stop_reason: "end_turn",
      parsed_output: {
        title: "Cotação pelo WhatsApp", description: "Do pedido à proposta",
        nodes: [
          { key: "a", kind: "start", title: "Cliente pediu cotação", detail: "", owner: "", link: "" },
          { key: "b", kind: "step", title: "Confirmar datas", detail: "Pergunte a flexibilidade", owner: "Atendimento", link: "/app/crm" },
          { key: "c", kind: "decision", title: "Tem milhas?", detail: "", owner: "", link: "" },
          { key: "d", kind: "step", title: "Emitir com milhas", detail: "", owner: "Emissor", link: "/app/buscador" },
          { key: "e", kind: "task", title: "Cotar em dinheiro", detail: "", owner: "Emissor", link: "/app/admin" },
          { key: "b", kind: "step", title: "repetida", detail: "", owner: "", link: "" },
          { key: "f", kind: "end", title: "Proposta enviada", detail: "", owner: "", link: "" },
        ],
        edges: [
          { from: "a", to: "b", label: "" }, { from: "b", to: "c", label: "" }, { from: "c", to: "d", label: "Sim" }, { from: "c", to: "e", label: "Não" },
          { from: "d", to: "f", label: "" }, { from: "e", to: "f", label: "" }, { from: "e", to: "zz", label: "" },
        ],
      },
    };
    const r = await c.call(generateRoute.POST, "POST", "/x", { description: "Quando o cliente pede cotação no WhatsApp, confirmamos datas e vemos se tem milhas." });
    expect(r.status).toBe(200);
    const d = r.data.draft as { title: string; description: string; flow: Flow };
    expect([d.title, d.description]).toEqual(["Cotação pelo WhatsApp", "Do pedido à proposta"]);
    expect(d.flow.nodes.map((n) => n.title)).toEqual(["Cliente pediu cotação", "Confirmar datas", "Tem milhas?", "Emitir com milhas", "Cotar em dinheiro", "Proposta enviada"]);
    expect(d.flow.edges.map((e) => e.label)).toEqual([null, null, "Sim", "Não", null, null]);
    expect(d.flow.nodes.find((n) => n.title === "Confirmar datas")).toMatchObject({ owner: "Atendimento", link: "/app/crm", detail: "Pergunte a flexibilidade" });
    expect(d.flow.nodes.find((n) => n.title === "Cotar em dinheiro")).toMatchObject({ kind: "step", link: null }); // tipo e página fora da lista
    expect(new Set(d.flow.nodes.map((n) => n.y)).size).toBe(5); // em camadas
    const call = ai.calls[0] as { model: string; fallbacks: string; output_config: { effort: string; format: { type: string; schema: { properties: { nodes: { items: { properties: { link: { description: string } } } } } } } } };
    expect([call.model, call.fallbacks, call.output_config.effort]).toEqual(["claude-opus-5-5", "default", "medium"]);
    expect(call.output_config.format.type).toBe("json_schema");
    expect(call.output_config.format.schema.properties.nodes.items.properties.link.description).toContain("/app/acompanhamentos/voos");
    expect(await prisma.process.count()).toBe(0); // rascunho: não salva

    ai.reply = { stop_reason: "refusal", content: [], parsed_output: null };
    expect((await c.call(generateRoute.POST, "POST", "/x", { description: "Descrição qualquer do processo" })).status).toBe(422);
    ai.reply = { stop_reason: "end_turn", content: [], parsed_output: null };
    expect((await c.call(generateRoute.POST, "POST", "/x", { description: "Descrição qualquer do processo" })).status).toBe(502);
    expect((await c.call(generateRoute.POST, "POST", "/x", { description: "curta" })).status).toBe(400);
  });

  it("equipe: a função com Tarefas e processos pergunta e gera; sem a área (Contador), nada", async () => {
    ai.reply = { stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] };
    const bia = (await c.call(members.POST, "POST", "/m", { name: "Bia", email: "bia@x.test" })).data.id as string;
    const caio = (await c.call(members.POST, "POST", "/m", { name: "Caio", email: "caio@x.test" })).data.id as string;
    const atend = await join(bia, "ATENDIMENTO");
    const contador = await join(caio, "CONTADOR");
    expect((await atend.call(askRoute.POST, "POST", "/api/processes/ask", { question: "Quem faz?" })).status).toBe(200);
    ai.reply = { stop_reason: "end_turn", parsed_output: { title: "T", description: "D", nodes: [{ key: "a", kind: "step", title: "Uma", detail: "", owner: "", link: "" }], edges: [] } };
    expect((await atend.call(generateRoute.POST, "POST", "/api/processes/generate", { description: "Descrição qualquer do processo" })).status).toBe(200); // Atendimento edita tarefas e processos
    expect((await contador.call(askRoute.POST, "POST", "/api/processes/ask", { question: "Quem faz?" })).status).toBe(403);
  });
});
