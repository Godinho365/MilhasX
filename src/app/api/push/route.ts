import { z } from "zod";
import { route, json, parseBody, requireActor } from "@/server/http";
import { prisma, DomainError } from "@/server/db";
import { pushPublicKey } from "@/server/push";

const MAX_DEVICES = 10;

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Endereço de push inválido"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});
const unsubscribeSchema = z.object({ endpoint: z.string().max(1000) });

/** Guarda este aparelho para receber push. */
export const POST = route(async (req) => {
  const u = await requireActor(req);
  if (!pushPublicKey()) throw new DomainError(503, "O push ainda não está configurado no servidor");
  const { endpoint, keys } = await parseBody(req, subscribeSchema);
  const userAgent = req.headers.get("user-agent")?.slice(0, 300) ?? null;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId: u.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent },
    update: { userId: u.id, p256dh: keys.p256dh, auth: keys.auth, userAgent, lastUsedAt: new Date() },
  });
  // Limite de aparelhos: sai o mais antigo
  const old = await prisma.pushSubscription.findMany({ where: { userId: u.id }, orderBy: { lastUsedAt: "desc" }, skip: MAX_DEVICES, select: { id: true } });
  if (old.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
  return json({ ok: true, devices: await prisma.pushSubscription.count({ where: { userId: u.id } }) });
});

/** Este aparelho não recebe mais push. */
export const DELETE = route(async (req) => {
  const u = await requireActor(req);
  const { endpoint } = await parseBody(req, unsubscribeSchema);
  await prisma.pushSubscription.deleteMany({ where: { userId: u.id, endpoint } });
  return json({ ok: true });
});
