import { PrismaClient, Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Falhas de conexão passageiras (banco fora do ar por instantes, pool esgotado): vale tentar de novo. */
const CONNECTION_CODES = new Set(["P1001", "P1002", "P1017", "P2024"]);
export function isConnectionError(e: unknown) {
  const code = (e as { code?: string; errorCode?: string } | null)?.code ?? (e as { errorCode?: string } | null)?.errorCode;
  if (code && CONNECTION_CODES.has(code)) return true;
  return e instanceof Prisma.PrismaClientInitializationError && /reach database server/i.test(e.message);
}

const RETRY_DELAYS_MS = [300, 1000, 2500];

/** Repete a consulta quando a conexão falha (no Windows a porta do Docker às vezes some por alguns segundos). */
function createClient() {
  return new PrismaClient({ log: ["error"] }).$extends({
    query: {
      async $allOperations({ args, query }) {
        for (let attempt = 0; ; attempt++) {
          try {
            return await query(args);
          } catch (e) {
            if (attempt >= RETRY_DELAYS_MS.length || !isConnectionError(e)) throw e;
            log("warn", "db.retry", { attempt: attempt + 1, code: (e as { code?: string }).code ?? "init" });
            await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
          }
        }
      },
    },
  }) as unknown as PrismaClient;
}

export const prisma = globalForPrisma.prisma ?? createClient();
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
