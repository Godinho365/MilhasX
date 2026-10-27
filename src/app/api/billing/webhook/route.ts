import { route, json } from "@/server/http";
import { log } from "@/server/db";
import { syncSubscription, verifyWebhookSignature } from "@/server/services/billing-mp";

// Notificação do Mercado Pago. Só serve de aviso: a assinatura é consultada na API antes de mudar o plano.
export const POST = route(async (req) => {
  const url = new URL(req.url);
  let body: { type?: string; topic?: string; data?: { id?: string } } = {};
  try {
    body = await req.json();
  } catch {}
  const dataId = url.searchParams.get("data.id") ?? body.data?.id ?? null;
  if (!verifyWebhookSignature(req.headers.get("x-signature"), req.headers.get("x-request-id"), dataId)) {
    log("warn", "billing.webhook_bad_signature", {});
    return json({ ok: false }, 401);
  }
  const type = url.searchParams.get("type") ?? body.type ?? body.topic;
  if (type === "subscription_preapproval" && dataId) {
    try {
      await syncSubscription(dataId);
    } catch (e) {
      log("error", "billing.webhook_sync_failed", { message: e instanceof Error ? e.message : "erro" });
      return json({ ok: false }, 500); // o Mercado Pago tenta de novo
    }
  }
  return json({ ok: true });
});
