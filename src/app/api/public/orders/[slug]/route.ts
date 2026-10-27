import { route, json, parseBody, clientIp } from "@/server/http";
import { publicOrderSchema } from "@/server/schemas";
import { createPublicOrder } from "@/server/services/orders";

// Formulário "Pedir cotação" da página pública: sem login, limitado por IP, com campo-armadilha.
export const POST = route(async (req, { params }) => {
  const b = await parseBody(req, publicOrderSchema);
  const { website: _trap, ...input } = b;
  const r = await createPublicOrder((await params).slug!, { ...input, customerEmail: input.customerEmail || null }, clientIp(req));
  return json({ ok: true, ...r }, 201);
});
