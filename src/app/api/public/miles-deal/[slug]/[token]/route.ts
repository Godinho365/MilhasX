import { route, json, parseBody, clientIp } from "@/server/http";
import { dealPassengersSchema } from "@/server/schemas";
import { submitDealPassengers } from "@/server/services/miles-deals";

// Página do comprador (CRM Milhas): envio dos dados dos passageiros para a emissão
export const POST = route(async (req, { params }) => {
  const { slug, token } = await params;
  const b = await parseBody(req, dealPassengersSchema);
  return json(await submitDealPassengers(slug!, token!, b.passengers, clientIp(req)), 201);
});
