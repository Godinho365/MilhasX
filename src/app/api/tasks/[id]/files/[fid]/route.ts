import { route, json, requireUser } from "@/server/http";
import { getTaskFile, deleteTaskFile } from "@/server/services/team";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const f = await getTaskFile(u.id, p.id!, p.fid!);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(f.name),
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
    },
  });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  await deleteTaskFile(u.id, p.id!, p.fid!);
  return json({ ok: true });
});
