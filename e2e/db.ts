// Banco dos testes E2E. No servidor, o .env é o de PRODUÇÃO: sem esta troca, o E2E criava contas "Teste E2E"
// (inclusive admins com a senha do teste) no banco real. Aqui o E2E usa um banco próprio e se recusa a rodar
// em qualquer banco cujo nome não tenha "e2e" ou que seja o DATABASE_URL do .env.
import { existsSync } from "node:fs";

const dbName = (url: string) => new URL(url).pathname.replace(/^\//, "");

/** Mesmo servidor do TEST_DATABASE_URL, banco "<nome>_e2e" (ex.: milheiro_test → milheiro_e2e). */
export function deriveE2eUrl(testUrl: string) {
  const u = new URL(testUrl);
  u.pathname = `/${dbName(testUrl).replace(/_test$/, "")}_e2e`;
  return u.toString();
}

/** Lança erro se o banco não for claramente um banco de E2E (ou se for o banco do app). */
export function assertE2eDatabase(url: string, appUrl?: string) {
  const name = dbName(url);
  if (!/e2e/i.test(name)) throw new Error(`E2E recusado: o banco "${name}" não é de E2E (o nome precisa ter "e2e"). Defina E2E_DATABASE_URL.`);
  if (appUrl && dbName(appUrl) === name && new URL(appUrl).host === new URL(url).host) {
    throw new Error(`E2E recusado: "${name}" é o banco do app (DATABASE_URL).`);
  }
}

/**
 * URL do banco do E2E: E2E_DATABASE_URL, ou derivada do TEST_DATABASE_URL. Também troca o DATABASE_URL deste
 * processo (e dos que ele abre: o servidor do Playwright e o Prisma usado dentro dos testes) por ela.
 */
export function useE2eDatabase(env: NodeJS.ProcessEnv = process.env) {
  // O .env não sobrescreve o que já está no ambiente; o DATABASE_URL original é guardado para a comparação.
  if (existsSync(".env")) process.loadEnvFile(".env");
  const appUrl = env.E2E_APP_DATABASE_URL ?? env.DATABASE_URL;
  const url = env.E2E_DATABASE_URL ?? (env.TEST_DATABASE_URL ? deriveE2eUrl(env.TEST_DATABASE_URL) : undefined);
  if (!url) throw new Error("E2E recusado: defina E2E_DATABASE_URL (ou TEST_DATABASE_URL) no .env");
  assertE2eDatabase(url, appUrl === url ? undefined : appUrl);
  env.E2E_APP_DATABASE_URL = appUrl;
  env.E2E_DATABASE_URL = url;
  env.DATABASE_URL = url;
  return url;
}
