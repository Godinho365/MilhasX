import { route, json, requireUser } from "@/server/http";
import { sendHolderAccess, revokeHolderAccess, holderAccessStatus } from "@/server/services/holder-access";

export const GET = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await holderAccessStatus(u.id, (await params).id!) });
});

// Envia ao e-mail autorizado um link de uso único para a página do titular
export const POST = route(async (req, { params }) => {
  const u = await requireUser(req);
  const r = await sendHolderAccess(u.id, (await params).id!, process.env.APP_NAME || "MilhasX");
  return json({ ok: true, ...r });
});

export const DELETE = route(async (req, { params }) => {
  const u = await requireUser(req);
  return json({ ok: true, revoked: await revokeHolderAccess(u.id, (await params).id!) });
});
