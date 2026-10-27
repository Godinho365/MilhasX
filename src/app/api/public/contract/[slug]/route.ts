import { route, json, parseBody, clientIp } from "@/server/http";
import { publicContractSchema } from "@/server/schemas";
import { signContract } from "@/server/services/client-pages";

// "Assinatura de contrato" da página pública: sem login, limitado por IP.
export const POST = route(async (req, { params }) => {
  const b = await parseBody(req, publicContractSchema);
  return json(await signContract((await params).slug!, { name: b.name, email: b.email || null, phone: b.phone }, clientIp(req)), 201);
});
