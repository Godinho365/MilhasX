// Equipe com acesso próprio: convite, login do membro, permissões por função (checadas no servidor), dados da
// agência e o que é da pessoa (senha, nome, preferências), e tirar o acesso.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import { prisma } from "@/server/db";
import { resolveWorkspace } from "@/server/workspace";
import { apiRequirement, pageRequirement, homeFor, rolePermissions, allowed, can } from "@/domain/permissions";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as authMe from "@/app/api/auth/me/route";
import * as passwordRoute from "@/app/api/auth/password/route";
import * as meRoute from "@/app/api/me/route";
import * as prefs from "@/app/api/preferences/route";
import * as members from "@/app/api/team/members/route";
import * as member from "@/app/api/team/members/[id]/route";
import * as inviteRoute from "@/app/api/team/members/[id]/invite/route";
import * as accessRoute from "@/app/api/team/members/[id]/access/route";
import * as acceptRoute from "@/app/api/auth/invite/[token]/route";
import * as customers from "@/app/api/customers/route";
import * as sales from "@/app/api/sales/route";
import * as finance from "@/app/api/finance/accounts/route";
import * as billing from "@/app/api/billing/route";

let owner: Client, ownerId: string;
const tokenOf = (link: string) => link.split("/convite/")[1]!;

async function newMember(name = "Bia", email = "bia@agencia.test") {
  const r = await owner.call(members.POST, "POST", "/api/team/members", { name, email });
  return r.data.id as string;
}
/** Convida e aceita: devolve o cliente já logado como o membro. */
async function join(memberId: string, role: string, permissions?: string[], password = "senha-da-bia-1") {
  const inv = await owner.call(inviteRoute.POST, "POST", `/api/team/members/${memberId}/invite`, { role, permissions }, { id: memberId });
  expect(inv.status).toBe(201);
  const m = new Client();
  const acc = await m.call(acceptRoute.POST, "POST", `/api/auth/invite/x`, { name: "Bia Souza", password }, { token: tokenOf(inv.data.item.link) });
  expect(acc.status).toBe(201);
  return m;
}

beforeEach(async () => {
  await resetDb();
  owner = new Client();
  ownerId = (await owner.call(register.POST, "POST", "/api/auth/register", { name: "Agência Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
});

describe("mapa de permissões", () => {
  it("GET = ver, o resto = editar; rota fora do mapa é negada; algumas são só do dono", () => {
    expect(apiRequirement("/api/sales", "GET")).toEqual({ area: "vendas", level: "view" });
    expect(apiRequirement("/api/sales/abc", "PATCH")).toEqual({ area: "vendas", level: "edit" });
    expect(apiRequirement("/api/telegram/accounts/1/code", "POST")).toEqual({ area: "configuracoes", level: "edit" });
    expect(apiRequirement("/api/telegram/chats/1/messages", "GET")).toEqual({ area: "chat", level: "view" });
    expect(apiRequirement("/api/accounts/abc/credential/reveal", "POST")).toEqual({ area: "senhas", level: "view" }); // revelar = ver
    expect(apiRequirement("/api/accounts/abc/credential", "PUT")).toEqual({ area: "senhas", level: "edit" });
    expect(apiRequirement("/api/accounts/abc", "GET")).toEqual({ area: "milhas", level: "view" });
    expect(apiRequirement("/api/billing", "GET")).toBe("owner");
    expect(apiRequirement("/api/me/deletion", "POST")).toBe("owner");
    expect(apiRequirement("/api/me", "PATCH")).toBe("any");
    expect(apiRequirement("/api/rota-nova-sem-mapa", "GET")).toBe("deny");
    expect(pageRequirement("/app/financeiro/notas")).toEqual({ area: "financeiro", level: "view" });
    expect(pageRequirement("/app/equipe/tarefas")).toEqual({ area: "tarefas", level: "view" });
    expect(pageRequirement("/app/equipe")).toEqual({ area: "equipe", level: "view" });
    expect(pageRequirement("/app/upgrade")).toBe("owner");
    expect(pageRequirement("/app/pagina-nova")).toBe("deny");
    // editar inclui ver; a função pronta vira a lista de permissões
    expect(can(["vendas:edit"], "vendas", "view")).toBe(true);
    expect(can(["vendas:view"], "vendas", "edit")).toBe(false);
    expect(allowed("owner", "ALL", false)).toBe(false);
    expect(rolePermissions("CONTADOR")).toEqual(["financeiro:view", "painel:view", "vendas:view"]);
    expect(rolePermissions("CUSTOM", ["vendas:edit", "inventada:edit", "painel:edit"])).toEqual(["painel:view", "vendas:edit"]); // painel só tem "ver"
    expect(homeFor(["chat:edit"])).toBe("/app/chat-balcoes");
    expect(homeFor([])).toBe("/app/sem-acesso");
  });
});

describe("convite e login do membro", () => {
  it("o dono convida, o membro cria a senha e entra na conta da agência com a função", async () => {
    const id = await newMember();
    const bia = await join(id, "ATENDIMENTO");
    const me = await bia.call(authMe.GET, "GET", "/api/auth/me");
    expect(me.data).toMatchObject({ user: { name: "Bia Souza", email: "bia@agencia.test" }, access: { isOwner: false, role: "ATENDIMENTO", workspace: { name: "Agência Ana" } } });
    // na equipe: entra com login, função e quando entrou
    const list = (await owner.call(members.GET, "GET", "/api/team/members")).data.items;
    expect(list[0].access).toMatchObject({ status: "ACTIVE", role: "ATENDIMENTO", roleLabel: "Atendimento" });
    // o login dele também funciona pela tela de login
    const again = new Client();
    expect((await again.call(login.POST, "POST", "/api/auth/login", { email: "bia@agencia.test", password: "senha-da-bia-1" })).status).toBe(200);
    expect((await again.call(authMe.GET, "GET", "/api/auth/me")).data.access.isOwner).toBe(false);
  });

  it("o link vale uma vez, vence e não aceita e-mail que já tem conta", async () => {
    const id = await newMember();
    const inv = await owner.call(inviteRoute.POST, "POST", "/x", { role: "EMISSOR" }, { id });
    const token = tokenOf(inv.data.item.link);
    expect((await new Client().call(acceptRoute.GET, "GET", "/x", undefined, { token })).data.item).toMatchObject({ agency: "Agência Ana", role: "Emissor", email: "bia@agencia.test" });
    expect((await new Client().call(acceptRoute.POST, "POST", "/x", { name: "Bia", password: "senha-da-bia-1" }, { token })).status).toBe(201);
    expect((await new Client().call(acceptRoute.POST, "POST", "/x", { name: "Bia", password: "senha-da-bia-1" }, { token })).status).toBe(410); // já usado
    // vencido
    const id2 = await newMember("Caio", "caio@agencia.test");
    const inv2 = await owner.call(inviteRoute.POST, "POST", "/x", { role: "EMISSOR" }, { id: id2 });
    await prisma.teamMember.update({ where: { id: id2 }, data: { inviteExpiresAt: new Date(Date.now() - 1000) } });
    expect((await new Client().call(acceptRoute.POST, "POST", "/x", { name: "Caio", password: "senha-do-caio-1" }, { token: tokenOf(inv2.data.item.link) })).status).toBe(410);
    // e-mail que já tem conta no MilhasX (a do dono)
    const id3 = await newMember("Outro", "ana@x.test");
    expect((await owner.call(inviteRoute.POST, "POST", "/x", { role: "EMISSOR" }, { id: id3 })).status).toBe(409);
    // o link guardado é só o hash
    expect(JSON.stringify(await prisma.teamMember.findMany())).not.toContain(tokenOf(inv2.data.item.link));
  });
});

describe("permissões no servidor", () => {
  it("atendimento: vê vendas mas não lança; não vê financeiro nem assinatura; não gerencia a equipe", async () => {
    const id = await newMember();
    const bia = await join(id, "ATENDIMENTO");
    expect((await bia.call(sales.GET, "GET", "/api/sales")).status).toBe(200);
    expect((await bia.call(sales.POST, "POST", "/api/sales", {})).status).toBe(403);
    expect((await bia.call(finance.GET, "GET", "/api/finance/accounts")).status).toBe(403);
    expect((await bia.call(billing.GET, "GET", "/api/billing")).status).toBe(403);
    expect((await bia.call(members.GET, "GET", "/api/team/members")).status).toBe(200); // ver a equipe
    expect((await bia.call(members.POST, "POST", "/api/team/members", { name: "Intruso" })).status).toBe(403);
    expect((await bia.call(inviteRoute.POST, "POST", `/api/team/members/${id}/invite`, { role: "ADMIN" }, { id })).status).toBe(403);
  });

  it("o que o membro cria fica na conta da agência (do dono)", async () => {
    const id = await newMember();
    const bia = await join(id, "ATENDIMENTO");
    const r = await bia.call(customers.POST, "POST", "/api/customers", { name: "Cliente da Bia" });
    expect(r.status).toBe(201);
    const c = await prisma.customer.findFirstOrThrow({ where: { name: "Cliente da Bia" } });
    expect(c.userId).toBe(ownerId);
    expect((await owner.call(customers.GET, "GET", "/api/customers")).data.items.map((x: { name: string }) => x.name)).toContain("Cliente da Bia");
  });

  it("mudar a função vale na hora; ninguém muda o próprio acesso; administrador da equipe gerencia", async () => {
    const id = await newMember();
    const bia = await join(id, "CONTADOR");
    expect((await bia.call(customers.GET, "GET", "/api/customers")).status).toBe(403);
    expect((await owner.call(accessRoute.PATCH, "PATCH", "/x", { role: "CUSTOM", permissions: ["contatos:view"] }, { id })).status).toBe(200);
    expect((await bia.call(customers.GET, "GET", "/api/customers")).status).toBe(200);
    expect((await bia.call(customers.POST, "POST", "/api/customers", { name: "x" })).status).toBe(403);
    // administrador: gerencia a equipe, mas não o próprio acesso
    await owner.call(accessRoute.PATCH, "PATCH", "/x", { role: "ADMIN" }, { id });
    expect((await bia.call(members.POST, "POST", "/api/team/members", { name: "Caio", email: "caio@agencia.test" })).status).toBe(201);
    expect((await bia.call(accessRoute.PATCH, "PATCH", `/api/team/members/${id}/access`, { role: "CONTADOR" }, { id })).status).toBe(403);
    expect((await bia.call(accessRoute.DELETE, "DELETE", `/api/team/members/${id}/access`, undefined, { id })).status).toBe(403);
    // e não vê a assinatura do dono
    expect((await bia.call(billing.GET, "GET", "/api/billing")).status).toBe(403);
  });
});

describe("o que é da pessoa", () => {
  it("senha e nome: do membro, sem tocar no dono", async () => {
    const id = await newMember();
    const bia = await join(id, "ATENDIMENTO");
    expect((await bia.call(passwordRoute.POST, "POST", "/api/auth/password", { current: "senha-da-bia-1", next: "senha-nova-da-bia" })).status).toBe(200);
    expect((await bia.call(meRoute.PATCH, "PATCH", "/api/me", { name: "Bia S." })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ownerId } })).name).toBe("Agência Ana");
    expect((await new Client().call(login.POST, "POST", "/api/auth/login", { email: "ana@x.test", password: "senha-forte-1" })).status).toBe(200); // a do dono continua
    expect((await new Client().call(login.POST, "POST", "/api/auth/login", { email: "bia@agencia.test", password: "senha-nova-da-bia" })).status).toBe(200);
  });

  it("preferências pessoais são de cada um; as da agência só com permissão de configurações", async () => {
    const id = await newMember();
    const bia = await join(id, "ATENDIMENTO");
    expect((await bia.call(prefs.PATCH, "PATCH", "/api/preferences", { soundEffects: false })).data.item.soundEffects).toBe(false);
    expect((await owner.call(prefs.GET, "GET", "/api/preferences")).data.item.soundEffects).toBe(true); // o dono não mudou
    expect((await bia.call(prefs.PATCH, "PATCH", "/api/preferences", { emissionTerms: "termo da Bia" })).status).toBe(403);
    await owner.call(accessRoute.PATCH, "PATCH", "/x", { role: "ADMIN" }, { id });
    expect((await bia.call(prefs.PATCH, "PATCH", "/api/preferences", { emissionTerms: "termo da agência" })).status).toBe(200);
    expect((await owner.call(prefs.GET, "GET", "/api/preferences")).data.item.emissionTerms).toBe("termo da agência"); // vale para a agência
  });
});

describe("tirar o acesso", () => {
  it("tirar o acesso derruba a sessão e apaga o login; o cadastro na equipe continua", async () => {
    const id = await newMember();
    const bia = await join(id, "EMISSOR");
    expect((await owner.call(accessRoute.DELETE, "DELETE", "/x", undefined, { id })).status).toBe(200);
    expect((await bia.call(sales.GET, "GET", "/api/sales")).status).toBe(401);
    expect((await new Client().call(login.POST, "POST", "/api/auth/login", { email: "bia@agencia.test", password: "senha-da-bia-1" })).status).toBe(401);
    expect(await prisma.teamMember.findUnique({ where: { id } })).toMatchObject({ name: "Bia", loginUserId: null, accessRole: null });
  });

  it("desativar ou apagar o membro também tira o acesso", async () => {
    const id = await newMember();
    const bia = await join(id, "EMISSOR");
    await owner.call(member.PUT, "PUT", "/x", { name: "Bia", email: "bia@agencia.test", active: false }, { id });
    expect((await bia.call(sales.GET, "GET", "/api/sales")).status).toBe(401);
    const id2 = await newMember("Caio", "caio@agencia.test");
    const caio = await join(id2, "EMISSOR", undefined, "senha-do-caio-1");
    await owner.call(member.DELETE, "DELETE", "/x", undefined, { id: id2 });
    expect((await caio.call(sales.GET, "GET", "/api/sales")).status).toBe(401);
    expect(await prisma.user.count({ where: { workspaceOwnerId: ownerId } })).toBe(0);
  });

  it("membro de um administrador da plataforma nunca é administrador", async () => {
    await prisma.user.update({ where: { id: ownerId }, data: { role: "ADMIN" } });
    const id = await newMember();
    await join(id, "ADMIN");
    const person = await prisma.user.findFirstOrThrow({ where: { workspaceOwnerId: ownerId } });
    const ws = await resolveWorkspace(person);
    expect([ws?.id, ws?.role, ws?.actor.isOwner]).toEqual([ownerId, "USER", false]);
  });
});
