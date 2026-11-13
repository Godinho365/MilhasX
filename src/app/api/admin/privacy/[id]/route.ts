import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { setPrivacyStatus } from "@/server/services/admin";

const schema = z.object({ status: z.enum(["NEW", "IN_PROGRESS", "DONE"]) });

export const PATCH = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const { status } = await parseBody(req, schema);
  await setPrivacyStatus(admin.id, (await params).id!, status);
  return json({ ok: true });
});
