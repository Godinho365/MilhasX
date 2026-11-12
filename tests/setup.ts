import { existsSync } from "node:fs";

if (existsSync(".env")) process.loadEnvFile(".env");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// O .env pode ser o de produção: os testes não usam as integrações reais (cada teste liga a que precisa com vi.stubEnv).
// Vazio em vez de delete: o Prisma relê o .env ao conectar e devolveria as que faltam (vazio = desligado).
for (const k of ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "TURNSTILE_SITE_KEY", "TURNSTILE_SECRET_KEY", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "META_APP_ID", "META_APP_SECRET"]) {
  process.env[k] = "";
}
// NODE_ENV é definido como "test" pelo vitest
