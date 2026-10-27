import { route, json, requireAdmin, readBodyLimited } from "@/server/http";
import { setProgramLogo, removeProgramLogo } from "@/server/services/admin";

// Corpo da requisição = bytes da imagem (até 256 KB). O tipo é validado pelo conteúdo.
export const PUT = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await setProgramLogo(admin.id, (await params).id!, await readBodyLimited(req, 256 * 1024, "Imagem maior que 256 KB"));
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await removeProgramLogo(admin.id, (await params).id!);
  return json({ ok: true });
});
