import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

export default function setup() {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Defina TEST_DATABASE_URL no .env para rodar os testes");
  // Aplica as migrações versionadas no banco de teste (também testa as migrações)
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
