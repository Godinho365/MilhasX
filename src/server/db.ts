import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ log: ["error"] });
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Tx = Prisma.TransactionClient;

export class DomainError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function audit(
  db: Tx | PrismaClient,
  actorId: string | null,
  action: string,
  targetType: string,
  targetId?: string | null,
  meta?: Prisma.InputJsonValue,
) {
  await db.auditLog.create({ data: { actorId, action, targetType, targetId: targetId ?? null, meta } });
}

/** Log estruturado. Nunca passe senhas, tokens ou corpos de requisição aqui. */
export function log(level: "info" | "warn" | "error", msg: string, data: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === "test") return;
  console[level](JSON.stringify({ t: new Date().toISOString(), level, msg, ...data }));
}
