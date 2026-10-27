import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { getOrderFile, deleteOrderFile, setOrderFileVisible } from "@/server/services/orders";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const f = await getOrderFile(u.id, p.id!, p.fid!);
  return new Response(new Uint8Array(f.data), {
    headers: {
      "content-type": f.mime,
      "content-disposition": "attachment; filename*=UTF-8''" + encodeURIComponent(f.name),
      "content-security-policy": "default-src 'none'",
      "x-content-type-options": "nosniff",
    },
  });
});

export const PATCH = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  const { visibleToClient } = await parseBody(req, z.object({ visibleToClient: z.boolean() }));
  await setOrderFileVisible(u.id, p.id!, p.fid!, visibleToClient);
  return json({ ok: true });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  const p = await params;
  await deleteOrderFile(u.id, p.id!, p.fid!);
  return json({ ok: true });
});
