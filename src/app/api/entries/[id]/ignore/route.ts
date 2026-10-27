import { z } from "zod";
import { route, json, parseBody, requireUser } from "@/server/http";
import { setEntryIgnored } from "@/server/services/ledger";

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const { ignored } = await parseBody(req, z.object({ ignored: z.boolean() }));
  await setEntryIgnored(u.id, (await params).id!, ignored);
  return json({ ok: true });
});
