// Antes do E2E: cria o banco próprio (se faltar), aplica as migrações e roda o seed (os testes usam os programas dele).
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { assertE2eDatabase } from "./db";

export default async function setup() {
  const url = process.env.E2E_DATABASE_URL!; // definido por useE2eDatabase() no playwright.config.ts
  assertE2eDatabase(url, process.env.E2E_APP_DATABASE_URL);
  const name = new URL(url).pathname.slice(1);

  // Conecta no banco "postgres" do mesmo servidor para criar o do E2E
  const admin = new URL(url);
  admin.pathname = "/postgres";
  admin.search = "";
  const pg = new PrismaClient({ datasourceUrl: admin.toString() });
  try {
    const [r] = await pg.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM pg_database WHERE datname = ${name}`;
    if (!r || Number(r.n) === 0) await pg.$executeRawUnsafe(`CREATE DATABASE "${name.replace(/"/g, "")}"`);
  } finally {
    await pg.$disconnect();
  }

  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  execSync("npx tsx prisma/seed.ts", { env, stdio: "pipe" });
}
