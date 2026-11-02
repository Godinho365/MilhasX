import { describe, it, expect } from "vitest";
import { Prisma, PrismaClient } from "@prisma/client";
import { isConnectionError } from "@/server/db";

describe("falha de conexão com o banco", () => {
  it("reconhece banco fora do ar e pool esgotado, mas não erros de dados", async () => {
    const dead = new PrismaClient({ datasourceUrl: "postgresql://x:y@127.0.0.1:1/z?connect_timeout=2" });
    const err = await dead.$queryRaw`select 1`.catch((e) => e);
    await dead.$disconnect();
    expect(isConnectionError(err)).toBe(true);
    expect(isConnectionError(new Prisma.PrismaClientKnownRequestError("pool", { code: "P2024", clientVersion: "x" }))).toBe(true);
    expect(isConnectionError(new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "x" }))).toBe(false);
    expect(isConnectionError(new Error("qualquer"))).toBe(false);
  });
});
