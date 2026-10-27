import { route, json, parseBody, clientIp } from "@/server/http";
import { publicLeadSchema } from "@/server/schemas";
import { createPublicLead } from "@/server/services/leads";

// "Interesse em gestão de milhas" da Central de Atendimento: sem login, limitado por IP.
export const POST = route(async (req, { params }) => {
  const b = await parseBody(req, publicLeadSchema);
  await createPublicLead((await params).slug!, { name: b.name, phone: b.phone, email: b.email || null, message: b.message }, clientIp(req));
  return json({ ok: true }, 201);
});
