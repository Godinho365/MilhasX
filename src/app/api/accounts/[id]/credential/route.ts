import { route, json, parseBody, requireUser } from "@/server/http";
import { credentialSchema } from "@/server/schemas";
import { saveCredential, deleteCredential } from "@/server/services/accounts";

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  await saveCredential(u.id, (await params).id!, await parseBody(req, credentialSchema));
  return json({ ok: true });
});
export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  await deleteCredential(u.id, (await params).id!);
  return json({ ok: true });
});
