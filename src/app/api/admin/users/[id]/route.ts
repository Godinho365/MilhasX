import { route, json, parseBody, requireAdmin } from "@/server/http";
import { userStatusSchema } from "@/server/schemas";
import { setUserStatus } from "@/server/services/admin";

// Só o status pode ser alterado aqui; o papel ADMIN não muda por requisição.
export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { status } = await parseBody(req, userStatusSchema);
  await setUserStatus(admin.id, (await params).id!, status);
  return json({ ok: true });
});
