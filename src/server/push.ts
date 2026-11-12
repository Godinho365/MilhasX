import webpush, { WebPushError } from "web-push";
import { prisma, log } from "./db";
import { notifyPrefs, type NotifyCategory } from "@/domain/plans";

/**
 * Push no celular (Web Push). Liga com VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY no .env
 * (gere com: npm run push:keys). Sem as chaves, nada sai e o botão de ativar não aparece.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** Página aberta ao tocar na notificação. */
  url?: string;
  /** Avisos com a mesma tag substituem o anterior no celular, em vez de empilhar. */
  tag?: string;
}

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY?.trim() || "";
}

let configured = "";
function ready() {
  const pub = pushPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!pub || !priv) return false;
  if (configured !== pub) {
    const contact = process.env.CONTACT_EMAIL?.trim() || "contato@gomilhasx.com";
    webpush.setVapidDetails(`mailto:${contact}`, pub, priv);
    configured = pub;
  }
  return true;
}

/** Nos testes nada sai: os envios ficam aqui para conferir. */
export const testPushes: { userId: string; endpoint: string; payload: PushPayload }[] = [];

/** Manda para todos os aparelhos da pessoa. Aparelho que não existe mais (404/410) é apagado. */
export async function sendPushToUser(userId: string, payload: PushPayload): Promise<number> {
  const testing = process.env.NODE_ENV === "test";
  if (!testing && !ready()) return 0;
  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  let sent = 0;
  const body = JSON.stringify({ url: "/app/notifications", ...payload });
  await Promise.all(
    subs.map(async (s) => {
      try {
        if (testing) testPushes.push({ userId, endpoint: s.endpoint, payload });
        else await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 3600, urgency: "normal" });
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      } catch (e) {
        if (e instanceof WebPushError && (e.statusCode === 404 || e.statusCode === 410)) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          log("warn", "push.failed", { status: e instanceof WebPushError ? e.statusCode : undefined, err: String(e).slice(0, 200) });
        }
      }
    }),
  );
  return sent;
}

/** Manda o push se a pessoa ligou "Push no celular" para esta categoria. */
export async function pushIfWanted(userId: string, category: NotifyCategory, payload: PushPayload) {
  const pref = await prisma.userPreference.findUnique({ where: { userId }, select: { notifications: true } });
  if (!notifyPrefs(pref?.notifications)[category]?.push) return 0;
  return sendPushToUser(userId, payload);
}

const CATEGORIES = new Set<string>(["points", "entries", "marketing", "system", "billing"]);

/** Chamado depois de criar avisos no sino (ver db.ts): cada aviso novo vira push para quem pediu. */
export async function pushForNotifications(rows: { userId: string; title: string; body: string; category?: string | null; key?: string | null }[]) {
  await Promise.all(
    rows.map((n) => {
      const category = (n.category && CATEGORIES.has(n.category) ? n.category : "system") as NotifyCategory;
      return pushIfWanted(n.userId, category, { title: n.title, body: n.body, tag: n.key ?? undefined }).catch((e) => log("warn", "push.failed", { err: String(e).slice(0, 200) }));
    }),
  );
}

/** Gera o par de chaves VAPID (uma vez, para o .env). */
export const generatePushKeys = () => webpush.generateVAPIDKeys();
