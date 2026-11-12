import { route, json, parseBody, requireUser } from "@/server/http";
import { DomainError } from "@/server/db";
import { preferenceSchema } from "@/server/schemas";
import { savePreferences, getPreferences } from "@/server/services/settings";
import { can } from "@/domain/permissions";

// Preferências. As pessoais (valores visíveis, som, tutoriais, checklist...) são de quem entrou: cada membro da
// equipe tem as suas e não mexe nas do dono. As da agência (avisos, PIX, termo de emissão) são da conta do dono e
// só quem pode editar as configurações muda.
const AGENCY = ["notifications", "pix", "emissionTerms"] as const;

async function read(userId: string, actorId: string) {
  const [personal, agency] = await Promise.all([getPreferences(actorId), actorId === userId ? null : getPreferences(userId)]);
  return agency ? { ...personal, notifications: agency.notifications, pix: agency.pix, emissionTerms: agency.emissionTerms } : personal;
}

export const GET = route(async (req) => {
  const u = await requireUser(req);
  return json({ ok: true, item: await read(u.id, u.actor.id) });
});

export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const b = await parseBody(req, preferenceSchema);
  const agency = Object.fromEntries(AGENCY.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]));
  const personal = Object.fromEntries(Object.entries(b).filter(([k]) => !(AGENCY as readonly string[]).includes(k)));
  if (Object.keys(agency).length && !can(u.actor.permissions, "configuracoes", "edit")) throw new DomainError(403, "Sua função na equipe não dá acesso às configurações da agência");
  if (u.actor.id === u.id) await savePreferences(u.id, b);
  else {
    if (Object.keys(personal).length) await savePreferences(u.actor.id, personal);
    if (Object.keys(agency).length) await savePreferences(u.id, agency);
  }
  return json({ ok: true, item: await read(u.id, u.actor.id) });
});
