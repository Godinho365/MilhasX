import { route, json, requireAdmin } from "@/server/http";
import { DomainError } from "@/server/db";
import { setProgramLogo, removeProgramLogo } from "@/server/services/admin";

// Corpo da requisição = bytes da imagem (até 256 KB). O tipo é validado pelo conteúdo.
export const PUT = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  if (Number(req.headers.get("content-length") || 0) > 256 * 1024) throw new DomainError(413, "Imagem maior que 256 KB");
  await setProgramLogo(admin.id, (await params).id!, Buffer.from(await req.arrayBuffer()));
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  await removeProgramLogo(admin.id, (await params).id!);
  return json({ ok: true });
});
