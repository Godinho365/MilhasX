import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { setSelfHolder } from "@/server/services/wallet";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const { isSelf } = await parseBody(req, z.object({ isSelf: z.boolean() }));
  await setSelfHolder(u.id, (await params).id!, isSelf);
  return json({ ok: true });
});
