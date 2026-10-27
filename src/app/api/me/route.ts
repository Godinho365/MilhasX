import { route, json, parseBody, requireUser } from "@/server/http";
import { profileSchema } from "@/server/schemas";
import { updateProfile } from "@/server/services/settings";

// Só o nome muda aqui; e-mail, papel e plano não são editáveis pelo próprio usuário.
export const PATCH = route(async (req) => {
  const u = await requireUser(req);
  const { name } = await parseBody(req, profileSchema);
  await updateProfile(u.id, name);
  return json({ ok: true });
});
