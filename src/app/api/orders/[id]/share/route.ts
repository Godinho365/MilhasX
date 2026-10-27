import { route, json, parseBody, requireUser } from "@/server/http";
import { orderClientInfoSchema } from "@/server/schemas";
import { orderShareToken, setOrderClientInfo } from "@/server/services/client-pages";
import { prisma } from "@/server/db";

// Link do pedido para o cliente (páginas Cotação e Reserva confirmada) e o que aparece nelas.
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const token = await orderShareToken(u.id, (await params).id!);
  const slug = (await prisma.salesProfile.findUnique({ where: { userId: u.id }, select: { slug: true } }))?.slug ?? null;
  return json({ ok: true, token, slug });
});

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, orderClientInfoSchema);
  await setOrderClientInfo(u.id, (await params).id!, b);
  return json({ ok: true });
});
