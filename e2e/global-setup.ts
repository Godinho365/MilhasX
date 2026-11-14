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

  // A migração 20261027090000_calculators cria as parcerias 1:1 a partir dos programas que já existiam; num banco novo
  // os programas só chegam no seed, depois das migrações, e as Rotas de Transferência ficavam vazias. Repete aqui.
  const db = new PrismaClient({ datasourceUrl: url });
  try {
    await db.$executeRawUnsafe(`
      INSERT INTO "TransferPartner" ("id", "fromProgramId", "toProgramId", "fromUnits", "toUnits", "updatedAt")
      SELECT 'tp_' || md5(f."id" || t."id"), f."id", t."id", 1, 1, NOW()
      FROM "Program" f JOIN "Program" t ON (f."code", t."code") IN (('LIVELO','SMILES'),('LIVELO','LATAM'),('LIVELO','AZUL'),('ESFERA','SMILES'),('ESFERA','LATAM'),('ESFERA','AZUL'))
      ON CONFLICT DO NOTHING`);
  } finally {
    await db.$disconnect();
  }
}
