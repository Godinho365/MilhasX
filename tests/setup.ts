import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// O .env pode ser o de produção: os testes não usam as integrações reais (cada teste liga a que precisa com vi.stubEnv)
for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]) {
  delete process.env[k];
}
// NODE_ENV é definido como "test" pelo vitest
