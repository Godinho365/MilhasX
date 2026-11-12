// Equipe com acesso próprio: convite, aceite, função e permissões, e tirar o acesso.
// O dono (ou um membro com "equipe: editar") convida um membro já cadastrado na Equipe: gera um link de uso único
// (7 dias) para o e-mail do membro. Quem abre o link cria a senha e entra na conta da agência com a função escolhida.
// O link só fica guardado como hash. Tirar o acesso apaga o login do membro (as sessões dele caem na hora); o
// cadastro na Equipe continua (tarefas, metas).
import { randomBytes } from "node:crypto";
import { prisma, DomainError, audit } from "../db";
import { sha256, hashPassword, validatePassword, createSession } from "../auth";
import { sendMail } from "../mailer";
import { rolePermissions, ROLES, ROLE_LABEL, type RoleKey } from "@/domain/permissions";

/** Quantos membros com acesso (login ou convite pendente) uma conta pode ter. */
export const TEAM_MAX_LOGINS = 20;
const INVITE_DAYS = 7;
const ROLE_KEYS = [...Object.keys(ROLES), "CUSTOM"] as RoleKey[];

export type AccessInput = { role: RoleKey; permissions?: string[] };

function checkRole(input: AccessInput) {
  if (!ROLE_KEYS.includes(input.role)) throw new DomainError(400, "Função inválida");
  const perms = rolePermissions(input.role, input.permissions ?? []);
  if (input.role === "CUSTOM" && !perms.length) throw new DomainError(400, "Escolha ao menos uma área para a função personalizada");
  return { accessRole: input.role, permissions: input.role === "CUSTOM" ? perms : [] };
}

async function ownMember(ownerId: string, memberId: string) {
  const m = await prisma.teamMember.findFirst({ where: { id: memberId, userId: ownerId } });
  if (!m) throw new DomainError(404, "Membro não encontrado");
  return m;
}

/** Ninguém mexe no próprio acesso (um administrador não se tira nem muda a própria função). */
function notSelf(actorMemberId: string | null, memberId: string) {
  if (actorMemberId && actorMemberId === memberId) throw new DomainError(403, "Você não pode mudar o seu próprio acesso: peça ao dono da conta");
}

const inviteLink = (appUrl: string, token: string) => `${appUrl.replace(/\/+$/, "")}/convite/${token}`;

/**
 * Convida (ou convida de novo, com um link novo) o membro para entrar com login próprio. Devolve o link para o dono
 * mandar (o e-mail também sai, quando há um provedor configurado).
 */
export async function inviteMember(ownerId: string, memberId: string, input: AccessInput & { email?: string | null }, ctx: { actorId: string; actorMemberId: string | null; appUrl: string; agencyName: string }) {
  notSelf(ctx.actorMemberId, memberId);
  const m = await ownMember(ownerId, memberId);
  if (m.loginUserId) throw new DomainError(409, "Este membro já entra com login próprio: mude a função ou tire o acesso");
  if (!m.active) throw new DomainError(409, "Ative o membro antes de convidar");
  const email = (input.email?.trim() || m.email || "").toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError(400, "Informe o e-mail do membro para o convite");
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new DomainError(409, "Este e-mail já tem uma conta no MilhasX: use outro e-mail para o membro");
  }
  const busy = await prisma.teamMember.count({ where: { userId: ownerId, id: { not: m.id }, OR: [{ loginUserId: { not: null } }, { inviteTokenHash: { not: null }, inviteExpiresAt: { gt: new Date() } }] } });
  if (busy >= TEAM_MAX_LOGINS) throw new DomainError(409, `Limite de ${TEAM_MAX_LOGINS} acessos da equipe`);
  const access = checkRole(input);
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await prisma.teamMember.update({ where: { id: m.id }, data: { email, ...access, inviteTokenHash: sha256(token), inviteExpiresAt: expiresAt, invitedAt: new Date() } });
  await audit(prisma, ctx.actorId, "team.invite", "TeamMember", m.id, { workspace: ownerId, role: access.accessRole });
  const link = inviteLink(ctx.appUrl, token);
  await sendMail(email, `Convite para a equipe ${ctx.agencyName}`, `Olá, ${m.name}!\n\nVocê foi convidado para entrar na equipe ${ctx.agencyName} no MilhasX como ${ROLE_LABEL[access.accessRole as RoleKey]}.\nCrie sua senha por este link (vale ${INVITE_DAYS} dias):\n\n${link}\n`).catch(() => {});
  return { link, expiresAt: expiresAt.toISOString() };
}

/** Muda a função (e as permissões, na personalizada) de quem já entra ou tem convite pendente. Vale na hora. */
export async function updateAccess(ownerId: string, memberId: string, input: AccessInput, ctx: { actorId: string; actorMemberId: string | null }) {
  notSelf(ctx.actorMemberId, memberId);
  const m = await ownMember(ownerId, memberId);
  if (!m.loginUserId && !m.inviteTokenHash) throw new DomainError(409, "Este membro ainda não tem acesso: convide primeiro");
  const access = checkRole(input);
  await prisma.teamMember.update({ where: { id: m.id }, data: access });
  await audit(prisma, ctx.actorId, "team.access", "TeamMember", m.id, { workspace: ownerId, role: access.accessRole });
}

/** Tira o acesso: apaga o login do membro (as sessões caem na hora) e cancela convite pendente. */
export async function revokeAccess(ownerId: string, memberId: string, ctx: { actorId: string; actorMemberId: string | null }) {
  notSelf(ctx.actorMemberId, memberId);
  const m = await ownMember(ownerId, memberId);
  await prisma.$transaction(async (tx) => {
    await tx.teamMember.update({ where: { id: m.id }, data: { accessRole: null, permissions: [], loginUserId: null, inviteTokenHash: null, inviteExpiresAt: null, joinedAt: null, lastSeenAt: null } });
    if (m.loginUserId) await tx.user.deleteMany({ where: { id: m.loginUserId, workspaceOwnerId: ownerId } });
  });
  await audit(prisma, ctx.actorId, "team.revoke", "TeamMember", m.id, { workspace: ownerId });
}

/** Membro desativado ou apagado da Equipe: o login dele sai junto. */
export async function dropMemberLogin(ownerId: string, memberId: string) {
  const m = await prisma.teamMember.findFirst({ where: { id: memberId, userId: ownerId }, select: { loginUserId: true } });
  if (m?.loginUserId) await prisma.user.deleteMany({ where: { id: m.loginUserId, workspaceOwnerId: ownerId } });
}

async function memberByToken(token: string) {
  if (!token || token.length < 20) return null;
  const m = await prisma.teamMember.findUnique({ where: { inviteTokenHash: sha256(token) }, include: { user: { select: { name: true, status: true } } } });
  if (!m || !m.inviteExpiresAt || m.inviteExpiresAt < new Date() || m.user.status !== "ACTIVE" || !m.accessRole || !m.active) return null;
  return m;
}

/** O que a página do convite mostra (null = link inválido, usado ou vencido). */
export async function invitePreview(token: string) {
  const m = await memberByToken(token);
  return m ? { name: m.name, email: m.email!, agency: m.user.name, role: ROLE_LABEL[m.accessRole as RoleKey] ?? "Equipe" } : null;
}

/** Aceita o convite: cria o login do membro (com a senha escolhida) e já entra. O link não vale de novo. */
export async function acceptInvite(token: string, input: { name: string; password: string }) {
  validatePassword(input.password);
  const m = await memberByToken(token);
  if (!m) throw new DomainError(410, "Este convite não vale mais: peça um novo ao dono da conta");
  const email = m.email!;
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new DomainError(409, "Este e-mail já tem uma conta no MilhasX: peça ao dono da conta para convidar outro e-mail");
  const name = input.name.trim() || m.name;
  const user = await prisma.$transaction(async (tx) => {
    const u = await tx.user.create({ data: { name, email, passwordHash: await hashPassword(input.password), workspaceOwnerId: m.userId } });
    // a troca do convite pelo login é atômica: o mesmo link não cria dois logins
    const { count } = await tx.teamMember.updateMany({ where: { id: m.id, inviteTokenHash: m.inviteTokenHash }, data: { loginUserId: u.id, inviteTokenHash: null, inviteExpiresAt: null, joinedAt: new Date() } });
    if (!count) throw new DomainError(410, "Este convite não vale mais: peça um novo ao dono da conta");
    return u;
  });
  await audit(prisma, user.id, "team.join", "TeamMember", m.id, { workspace: m.userId });
  return createSession(user.id);
}
