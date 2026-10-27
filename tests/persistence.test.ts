import { describe, it, expect } from "vitest";
import { PrismaClient } from "@prisma/client";
import { prisma } from "@/server/db";
import { resetDb } from "./helpers";

describe("migrações e persistência", () => {
  it("migrações aplicadas e dados persistem entre conexões", async () => {
    const applied = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*)::bigint AS n FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    expect(Number(applied[0]!.n)).toBeGreaterThan(0);
    await resetDb();
    await prisma.program.create({ data: { name: "Esfera", code: "ESFERA" } });
    const other = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
    expect(await other.program.findUnique({ where: { code: "ESFERA" } })).not.toBeNull();
    await other.$disconnect();
  });

  it("restrições de integridade: sigla única e titular duplicado", async () => {
    await resetDb();
    await prisma.program.create({ data: { name: "A", code: "DUP" } });
    await expect(prisma.program.create({ data: { name: "B", code: "DUP" } })).rejects.toThrow();
  });
});
