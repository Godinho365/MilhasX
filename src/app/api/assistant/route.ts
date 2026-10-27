import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { askAssistant, assistantEnabled, usedToday, DAILY_LIMIT } from "@/server/services/assistant";

const askSchema = z.object({
  question: z.string().trim().min(2, "Escreva a pergunta").max(1000),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(4000) })).max(20).default([]),
});

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, enabled: assistantEnabled(), remaining: Math.max(0, DAILY_LIMIT - (await usedToday(u.id))) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, askSchema);
  const answer = await askAssistant(u.id, b.question, b.history);
  return json({ ok: true, answer, remaining: Math.max(0, DAILY_LIMIT - (await usedToday(u.id))) });
});
