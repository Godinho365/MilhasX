import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

/** Trava do banco de teste (número fixo e arbitrário para o pg_advisory_lock). */
const TEST_DB_LOCK = 724_100_365;
const WAIT_MS = 20 * 60_000;

/**
 * Antes de tudo: as migrações no banco de teste e a trava de "uma execução por vez". Todas as execuções usam o mesmo
 * banco (TEST_DATABASE_URL) e cada arquivo começa apagando as tabelas (resetDb): duas execuções ao mesmo tempo
 * apagavam os dados uma da outra no meio dos testes (falhas que pareciam aleatórias, como nos reembolsos de venda).
 * Com a trava, a segunda espera a primeira terminar. A trava fica numa conexão própria e sai sozinha se o processo
 * morrer (o Postgres solta a trava quando a conexão cai).
 */
export default async function setup() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Defina TEST_DATABASE_URL no .env para rodar os testes");

  // uma conexão só, para a trava valer até o fim (trava de sessão do Postgres)
  const lockDb = new PrismaClient({ datasourceUrl: `${url}${url.includes("?") ? "&" : "?"}connection_limit=1` });
  const start = Date.now();
  let warned = false;
  for (;;) {
    const [r] = await lockDb.$queryRaw<{ ok: boolean }[]>`SELECT pg_try_advisory_lock(${TEST_DB_LOCK}::bigint) AS ok`;
    if (r?.ok) break;
    if (!warned) {
      console.log("Outra execução de testes está usando o banco de teste: esperando ela terminar…");
      warned = true;
    }
    if (Date.now() - start > WAIT_MS) {
      await lockDb.$disconnect();
      throw new Error("O banco de teste continua ocupado por outra execução de testes há 20 minutos");
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  // Aplica as migrações versionadas no banco de teste (também testa as migrações)
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });

  return async () => {
    await lockDb.$queryRaw`SELECT pg_advisory_unlock(${TEST_DB_LOCK}::bigint)`.catch(() => {});
    await lockDb.$disconnect();
  };
}
