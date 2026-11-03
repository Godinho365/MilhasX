import { route, json, parseBody, requireUser } from "@/server/http";
import { boardSchema } from "@/server/schemas";
import { listBoards, saveBoard } from "@/server/services/team";

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, items: await listBoards(u.id) });
});

export const POST = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, boardSchema);
  return json({ ok: true, id: await saveBoard(u.id, null, b) }, 201);
});
