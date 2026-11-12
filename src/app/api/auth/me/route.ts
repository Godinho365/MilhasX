import { route, json, requireUser } from "@/server/http";

// Quem entrou (o dono ou um membro da equipe) e, para membro, a função e as permissões dele.
export const GET = route(async (req) => {
  const u = await requireUser(req);
  const a = u.actor;
  return json({
    ok: true,
    user: { id: a.id, name: a.name, email: a.email, role: u.role },
    access: { isOwner: a.isOwner, role: a.role, permissions: a.permissions === "ALL" ? "ALL" : a.permissions, workspace: a.isOwner ? null : { name: u.name } },
  });
});
