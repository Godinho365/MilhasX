import Anthropic from "@anthropic-ai/sdk";

// Cliente da IA (Claude). Só funciona com ANTHROPIC_API_KEY no ambiente; sem a chave as funções de IA ficam
// desligadas e a tela avisa. Isolado aqui para os testes trocarem o cliente.
export const AI_MODEL = () => process.env.AI_MODEL || "claude-opus-5-5";
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY;
export const aiClient = () => new Anthropic();
/** Na recusa do modelo, a própria API tenta de novo num modelo de reserva (fallback no servidor). */
export const aiFallback = (): { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: "default" } => ({ betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
