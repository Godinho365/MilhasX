import Anthropic from "@anthropic-ai/sdk";
import { prisma, DomainError, audit, log } from "../db";

// Assistente IA: só funciona com ANTHROPIC_API_KEY no ambiente; sem a chave fica desativado.
export const DAILY_LIMIT = 30;
const MODEL = () => process.env.AI_MODEL || "claude-opus-5-5";

export const assistantEnabled = () => !!process.env.ANTHROPIC_API_KEY;

const SYSTEM = `Você é o assistente de um app de gestão de milhas e pontos. Responda em português do Brasil, de forma curta e prática.
Use os dados da carteira do usuário que vêm na mensagem quando forem relevantes. CPM é o custo por mil pontos.
Não invente promoções, preços ou regras de programas: se não souber, diga que não sabe. Não dê recomendação de investimento.`;

async function walletContext(userId: string) {
  const accounts = await prisma.account.findMany({
    where: { userId, archived: false },
    select: { balance: true, costCents: true, program: { select: { name: true } }, holder: { select: { name: true } } },
    orderBy: { balance: "desc" },
    take: 40,
  });
  if (!accounts.length) return "O usuário ainda não tem contas cadastradas.";
  return accounts
    .map((a) => {
      const cpm = a.balance > 0 ? ((a.costCents / a.balance) * 1000) / 100 : 0;
      return `- ${a.program.name} (${a.holder.name.split(" ")[0]}): ${a.balance.toLocaleString("pt-BR")} pts, CPM R$ ${cpm.toFixed(2)}`;
    })
    .join("\n");
}

export async function usedToday(userId: string) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.auditLog.count({ where: { actorId: userId, action: "assistant.ask", createdAt: { gte: start } } });
}

export async function askAssistant(userId: string, question: string, history: { role: "user" | "assistant"; content: string }[]) {
  if (!assistantEnabled()) throw new DomainError(503, "Assistente IA não configurado neste servidor");
  if ((await usedToday(userId)) >= DAILY_LIMIT) throw new DomainError(429, `Limite de ${DAILY_LIMIT} perguntas por dia atingido`);
  await audit(prisma, userId, "assistant.ask", "Assistant", null);

  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history.slice(-10),
    { role: "user", content: `Minha carteira hoje:\n${await walletContext(userId)}\n\nPergunta: ${question}` },
  ];
  try {
    const res = await client.beta.messages.create({
      model: MODEL(),
      max_tokens: 4000,
      system: SYSTEM,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages,
    } as Anthropic.Beta.MessageCreateParamsNonStreaming);
    if (res.stop_reason === "refusal") return "Não consigo ajudar com essa pergunta.";
    return res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim() || "Sem resposta.";
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new DomainError(429, "Assistente ocupado, tente de novo em instantes");
    if (e instanceof Anthropic.APIError) {
      log("error", "assistant.api_error", { status: e.status });
      throw new DomainError(502, "O assistente não respondeu. Tente de novo.");
    }
    throw e;
  }
}
