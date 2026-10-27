import { route, json, parseBody, requireUser } from "@/server/http";
import { orderClientInfoSchema } from "@/server/schemas";
import { orderShareToken, setOrderClientInfo, orderClientInfo } from "@/server/services/client-pages";

// Páginas do cliente para o pedido (cotação, reserva, termo): dados, link e o que aparece nelas.
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await orderClientInfo(u.id, (await params).id!) });
});

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const id = (await params).id!;
  const token = await orderShareToken(u.id, id);
  return json({ ok: true, token, slug: (await orderClientInfo(u.id, id)).slug });
});

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, orderClientInfoSchema);
  await setOrderClientInfo(u.id, (await params).id!, b);
  return json({ ok: true });
});
