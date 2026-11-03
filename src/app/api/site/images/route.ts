import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { uploadSiteImage } from "@/server/services/site";

// Corpo = bytes da foto
export const POST = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, id: await uploadSiteImage(u.id, await readBodyLimited(req, 3 * 1024 * 1024, "Foto maior que 3 MB")) }, 201);
});
