// IA dos Processos: responde dúvidas da equipe lendo os fluxogramas da agência e desenha um fluxograma a partir
// de uma descrição (o rascunho volta para a tela; só fica salvo quando a pessoa salva).
import Anthropic from "@anthropic-ai/sdk";
import { betaJSONSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/beta/json-schema";
import { prisma, DomainError, audit, log } from "../db";
import { AI_MODEL, aiClient, aiEnabled, aiFallback } from "../ai";
import { listProcesses } from "./team";
import { APP_PAGES, buildFlow, flowText, NODE_KIND_KEYS, type NodeKind } from "@/domain/process-flow";

export const PROCESS_AI_DAILY_LIMIT = 30;
/** Quanto do texto dos processos vai para a IA (o resto é cortado com aviso). */
const MAX_CONTEXT_CHARS = 120_000;

async function usedToday(userId: string) {
  const start = new Date(Date.now() - 24 * 3_600_000);
  return prisma.auditLog.count({ where: { actorId: userId, action: { in: ["processes.ask", "processes.generate"] }, createdAt: { gte: start } } });
}
async function gate(userId: string, action: "processes.ask" | "processes.generate") {
  if (!aiEnabled()) throw new DomainError(503, "A IA não está ligada neste servidor");
  if ((await usedToday(userId)) >= PROCESS_AI_DAILY_LIMIT) throw new DomainError(429, `Limite de ${PROCESS_AI_DAILY_LIMIT} usos da IA em 24 horas atingido`);
  await audit(prisma, userId, action, "Process", null);
}
function apiError(e: unknown): never {
  if (e instanceof Anthropic.RateLimitError) throw new DomainError(429, "A IA está ocupada, tente de novo em instantes");
  if (e instanceof Anthropic.APIError) {
    log("error", "process_ai.api_error", { status: e.status });
    throw new DomainError(502, "A IA não respondeu. Tente de novo.");
  }
  throw e;
}
const textOf = (content: Anthropic.Beta.BetaContentBlock[]) => content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();

/* ---------------- Perguntas ---------------- */

const ASK_SYSTEM = `Você tira dúvidas da equipe de uma agência de viagens e de milhas sobre os processos internos dela, descritos nos fluxogramas abaixo.
Responda em português do Brasil, curto e prático, em texto simples (listas curtas quando ajudar).
Baseie a resposta só nos processos: diga em qual processo e etapa está a resposta, quem é o responsável e a página do app, quando houver.
Se os processos não respondem, diga isso com clareza e sugira qual processo criar ou ajustar. Não invente regras de companhias aéreas, prazos ou valores.`;

export async function processContext(userId: string) {
  const ps = await listProcesses(userId);
  if (!ps.length) return { text: "A agência ainda não cadastrou nenhum processo.", count: 0, cut: false };
  let text = ps.map((p) => flowText(p)).join("\n\n");
  const cut = text.length > MAX_CONTEXT_CHARS;
  if (cut) text = `${text.slice(0, MAX_CONTEXT_CHARS)}\n[...os processos seguintes foram cortados por tamanho]`;
  return { text, count: ps.length, cut };
}

export async function askProcesses(userId: string, question: string, history: { role: "user" | "assistant"; content: string }[] = []) {
  await gate(userId, "processes.ask");
  const ctx = await processContext(userId);
  try {
    const res = await aiClient().beta.messages.create({
      model: AI_MODEL(),
      max_tokens: 4000,
      // os processos ficam num bloco fixo, com cache: as perguntas seguintes da mesma conta saem mais baratas
      system: [
        { type: "text", text: ASK_SYSTEM },
        { type: "text", text: `Processos da agência (${ctx.count}):\n\n${ctx.text}`, cache_control: { type: "ephemeral" } },
      ],
      output_config: { effort: "low" },
      ...aiFallback(),
      messages: [...history.slice(-10), { role: "user", content: question }],
    });
    if (res.stop_reason === "refusal") return { answer: "Não consigo ajudar com essa pergunta.", processes: ctx.count };
    return { answer: textOf(res.content) || "Sem resposta.", processes: ctx.count };
  } catch (e) {
    apiError(e);
  }
}

/* ---------------- Gerar fluxograma ---------------- */

/** Páginas do app que a IA pode ligar a uma etapa (vazio = nenhuma). */
const APP_LINKS = ["", ...APP_PAGES.map(([p]) => p)];

const FLOW_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Nome curto do processo" },
    description: { type: "string", description: "Para que serve, em uma frase" },
    nodes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string", description: "Identificador curto e único (ex.: a, b, c)" },
          kind: { type: "string", enum: [...NODE_KIND_KEYS] },
          title: { type: "string", description: "Texto curto da caixa; numa decisão, a pergunta" },
          detail: { type: "string", description: "Como fazer, em uma ou duas frases (ou vazio)" },
          owner: { type: "string", description: "Função responsável: Atendimento, Emissor, Financeiro, Administrador (ou vazio)" },
          link: { type: "string", enum: APP_LINKS, description: "Página do app onde a etapa é feita (ou vazio)" },
        },
        required: ["key", "kind", "title", "detail", "owner", "link"],
        additionalProperties: false,
      },
    },
    edges: {
      type: "array",
      items: {
        type: "object",
        properties: {
          from: { type: "string" },
          to: { type: "string" },
          label: { type: "string", description: "Saída de uma decisão (Sim, Não...) ou vazio" },
        },
        required: ["from", "to", "label"],
        additionalProperties: false,
      },
    },
  },
  required: ["title", "description", "nodes", "edges"],
  additionalProperties: false,
} as const;

const GENERATE_SYSTEM = `Você desenha fluxogramas dos processos internos de agências de viagens e de milhas, para a equipe seguir no dia a dia.
Monte o fluxograma do processo descrito pela pessoa, em português do Brasil:
- um "start" com o gatilho do processo e um ou mais "end" com cada resultado;
- "step" para cada ação concreta, com verbo no infinitivo ("Confirmar datas com o cliente"); de 4 a 15 etapas;
- "decision" só onde o caminho muda, com a pergunta no título e as saídas nas ligações ("Sim", "Não" ou a opção);
- "note" só para um alerta importante que não é etapa;
- o responsável (owner) quando a descrição deixa claro, e a página do app (link) quando a etapa é feita nela.
Use só o que a descrição diz ou o que é prática comum em agência; não invente regras de companhias aéreas, prazos ou valores.`;

export async function generateFlow(userId: string, description: string) {
  await gate(userId, "processes.generate");
  try {
    const res = await aiClient().beta.messages.parse({
      model: AI_MODEL(),
      max_tokens: 16000,
      system: GENERATE_SYSTEM,
      output_config: { effort: "medium", format: betaJSONSchemaOutputFormat(FLOW_SCHEMA) },
      ...aiFallback(),
      messages: [{ role: "user", content: description }],
    });
    if (res.stop_reason === "refusal") throw new DomainError(422, "A IA não conseguiu montar esse processo. Tente descrever de outro jeito.");
    const out = res.parsed_output;
    if (!out || !out.nodes.length) throw new DomainError(502, "A IA não devolveu um fluxograma. Tente de novo.");
    const keys = new Set<string>();
    // o SDK manda as opções (tipo, página) como orientação na descrição do campo: aqui o servidor confere
    const kinds = new Set<string>(NODE_KIND_KEYS);
    const pages = new Set(APP_PAGES.map(([p]) => p));
    const items = out.nodes.filter((n) => n.key && !keys.has(n.key) && keys.add(n.key)).map((n) => ({
      key: n.key, kind: (kinds.has(n.kind) ? n.kind : "step") as NodeKind, title: n.title, detail: n.detail || undefined, owner: n.owner || undefined,
      link: pages.has(n.link) ? n.link : undefined,
    }));
    const flow = buildFlow(items, out.edges.map((e): [string, string, string?] => [e.from, e.to, e.label || undefined]));
    return { title: out.title.trim().slice(0, 120) || "Novo processo", description: out.description.trim().slice(0, 1000) || null, flow };
  } catch (e) {
    if (e instanceof DomainError) throw e;
    apiError(e);
  }
}
