import { route, json, parseBody, clientIp, readCookie } from "@/server/http";
import { publicContractSchema } from "@/server/schemas";
import { signContract, accessCookie } from "@/server/services/client-pages";

// Assinatura do termo de compra e venda do pedido (exige o acesso confirmado pelos 4 dígitos).
export const POST = route(async (req, { params }) => {
  const p = await params;
  const b = await parseBody(req, publicContractSchema);
  return json(await signContract(p.slug!, p.token!, readCookie(req, accessCookie(p.token!)) ?? undefined, { name: b.name, cpf: b.cpf, birthDate: b.birthDate, address: b.address }, clientIp(req)), 201);
});
