// Equipe com acesso próprio: quem entrou (a pessoa) e de quem são os dados (a conta da agência).
// - Dono da conta: a pessoa e a conta são a mesma; pode tudo.
// - Membro: entra com o login dele (User com workspaceOwnerId), mas trabalha nos dados do dono. O "usuário" que as
//   rotas e páginas recebem é o do dono (o id de sempre para filtrar os dados), com `actor` = quem entrou e as
//   permissões da função. Nunca é administrador da plataforma, mesmo que o dono seja.
// Membro desativado, sem função ou com o dono suspenso não entra (as sessões dele caem).
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { rolePermissions, type Permission, type RoleKey } from "@/domain/permissions";

export type Actor = {
  id: string; name: string; email: string; avatarUpdatedAt: Date | null;
  isOwner: boolean; memberId: string | null; role: RoleKey | null; permissions: Permission[] | "ALL";
};
export type WorkspaceUser = Omit<User, "avatar"> & { actor: Actor };

const SEEN_EVERY_MS = 5 * 60_000;

export async function resolveWorkspace(user: Omit<User, "avatar">): Promise<WorkspaceUser | null> {
  if (!user.workspaceOwnerId) {
    return { ...user, actor: { id: user.id, name: user.name, email: user.email, avatarUpdatedAt: user.avatarUpdatedAt, isOwner: true, memberId: null, role: null, permissions: "ALL" } };
  }
  const [owner, member] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.workspaceOwnerId }, omit: { avatar: true } }),
    prisma.teamMember.findUnique({ where: { loginUserId: user.id } }),
  ]);
  if (!owner || owner.status !== "ACTIVE" || !member || member.userId !== owner.id || !member.active || !member.accessRole) return null;
  if (!member.lastSeenAt || Date.now() - member.lastSeenAt.getTime() > SEEN_EVERY_MS) {
    void prisma.teamMember.update({ where: { id: member.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  const role = member.accessRole as RoleKey;
  return {
    ...owner,
    role: "USER", // membro nunca é administrador da plataforma
    actor: { id: user.id, name: user.name, email: user.email, avatarUpdatedAt: user.avatarUpdatedAt, isOwner: false, memberId: member.id, role, permissions: rolePermissions(role, member.permissions) },
  };
}
