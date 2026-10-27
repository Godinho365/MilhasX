import { route, json, parseBody, requireUser } from "@/server/http";
import { beneficiaryLimitSchema, beneficiarySchema } from "@/server/schemas";
import { beneficiaryState, setBeneficiaryLimit, addBeneficiary } from "@/server/services/accounts";

// Limite de beneficiários da conta: situação, limite/janela e beneficiários informados à mão
export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await beneficiaryState(u.id, (await params).id!) });
});

export const PUT = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, beneficiaryLimitSchema);
  await setBeneficiaryLimit(u.id, (await params).id!, b);
  return json({ ok: true });
});

export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const b = await parseBody(req, beneficiarySchema);
  return json({ ok: true, item: await addBeneficiary(u.id, (await params).id!, { name: b.name, document: b.document, usedAt: new Date(b.usedAt) }) }, 201);
});
