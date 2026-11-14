import { existsSync } from "node:fs";
import { TEST_DISABLED_INTEGRATIONS } from "../e2e/db";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// O .env pode ser o de produção: os testes não usam as integrações reais (cada teste liga a que precisa com vi.stubEnv).
// Vazio em vez de delete: o Prisma relê o .env ao conectar e devolveria as que faltam (vazio = desligado).
for (const k of TEST_DISABLED_INTEGRATIONS) {
  process.env[k] = "";
}
// NODE_ENV é definido como "test" pelo vitest
