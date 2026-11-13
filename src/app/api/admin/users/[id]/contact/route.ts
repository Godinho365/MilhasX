import { z } from "zod";
import { route, json, parseBody, requireAdmin } from "@/server/http";
import { logContact } from "@/server/services/admin";

const schema = z.object({ channel: z.enum(["whatsapp", "email"]), reason: z.string().trim().max(60).default("") });

// Marca que a administração chamou o usuário (aba Recuperação)
export const POST = route(async (req, { params }) => {
  const admin = await requireAdmin(req);
  const b = await parseBody(req, schema);
  await logContact(admin.id, (await params).id!, b.channel, b.reason);
  return json({ ok: true });
});
