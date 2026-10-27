import { route, json, parseBody, clientIp } from "@/server/http";
import { orderAccessSchema } from "@/server/schemas";
import { verifyOrderAccess, accessCookie } from "@/server/services/client-pages";

// Cotação, reserva e termo: o cliente confirma os 4 últimos dígitos do telefone do pedido.
export const POST = route(async (req, { params }) => {
  const p = await params;
  const b = await parseBody(req, orderAccessSchema);
  const { session, expiresAt } = await verifyOrderAccess(p.slug!, p.token!, b.digits, clientIp(req));
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return json({ ok: true }, 200, { "set-cookie": `${accessCookie(p.token!)}=${session}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}` });
});
