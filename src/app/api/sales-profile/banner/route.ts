import { route, json, requireUser, readBodyLimited } from "@/server/http";
import { setBanner, removeBanner } from "@/server/services/settings";
import { assertFeature } from "@/server/services/plan-limits";

// Corpo da requisição = bytes da imagem (até 1 MB). O tipo é validado pelo conteúdo.
export const PUT = route(async (req) => {
  const u = await requireUser(req);
  await assertFeature(u.id, "pageBranding");
  await setBanner(u.id, await readBodyLimited(req, 1024 * 1024, "Imagem maior que 1 MB"));
  return json({ ok: true });
});

export const DELETE = route(async (req) => {
  const u = await requireUser(req);
  await removeBanner(u.id);
  return json({ ok: true });
});
