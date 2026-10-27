import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as login from "@/app/api/auth/login/route";
import * as me from "@/app/api/auth/me/route";
import * as users from "@/app/api/admin/users/route";
import * as user from "@/app/api/admin/users/[id]/route";
import * as programs from "@/app/api/admin/programs/route";
import * as auditRoute from "@/app/api/admin/audit/route";
import * as exportRoute from "@/app/api/admin/export/route";
import * as settings from "@/app/api/admin/settings/route";
import * as holders from "@/app/api/holders/route";
import { createAdmin } from "../scripts/create-admin-lib";
import { prisma } from "@/server/db";

let admin: Client, normal: Client, normalId: string;

beforeEach(async () => {
  await resetDb();
  await createAdmin({ email: "admin@x.test", name: "Admin", password: "senha-admin-123" });
  admin = new Client();
  expect((await admin.call(login.POST, "POST", "/l", { email: "admin@x.test", password: "senha-admin-123" })).status).toBe(200);
  normal = new Client();
  normalId = (await normal.call(register.POST, "POST", "/r", { name: "Nina", email: "n@x.test", password: "senha-forte-1" })).data.user.id;
});

describe("permissões administrativas", () => {
  it("usuário comum recebe 403 e anônimo 401", async () => {
    expect((await normal.call(users.GET, "GET", "/api/admin/users")).status).toBe(403);
    expect((await normal.call(programs.POST, "POST", "/p", { name: "X", code: "X1", kind: "POINTS", active: true, marketValueCpmCents: 1 })).status).toBe(403);
    expect((await normal.call(user.PATCH, "PATCH", "/u", { status: "DISABLED" }, { id: normalId })).status).toBe(403);
    expect((await new Client().call(users.GET, "GET", "/api/admin/users")).status).toBe(401);
  });

  it("não há como se promover a admin por requisição", async () => {
    await normal.call(user.PATCH, "PATCH", "/u", { status: "ACTIVE", role: "ADMIN" }, { id: normalId });
    await admin.call(user.PATCH, "PATCH", "/u", { status: "ACTIVE", role: "ADMIN" }, { id: normalId });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: normalId } })).role).toBe("USER");
  });

  it("admin desativa conta: sessões encerradas, login bloqueado, ação auditada", async () => {
    expect((await admin.call(user.PATCH, "PATCH", "/u", { status: "DISABLED" }, { id: normalId })).status).toBe(200);
    expect((await normal.call(me.GET, "GET", "/me")).status).toBe(401);
    expect((await new Client().call(login.POST, "POST", "/l", { email: "n@x.test", password: "senha-forte-1" })).status).toBe(401);
    const log = await admin.call(auditRoute.GET, "GET", "/api/admin/audit?action=admin.user_disable");
    expect(log.data.total).toBe(1);
  });

  it("admin não desativa a si mesmo", async () => {
    const adminId = (await admin.call(me.GET, "GET", "/me")).data.user.id;
    expect((await admin.call(user.PATCH, "PATCH", "/u", { status: "DISABLED" }, { id: adminId })).status).toBe(400);
  });

  it("gerencia programas, parâmetros e exporta CSV", async () => {
    const p = await admin.call(programs.POST, "POST", "/p", { name: "Smiles", code: "smiles", kind: "MILES", active: true, marketValueCpmCents: 1700 });
    expect(p.status).toBe(201);
    expect(p.data.item.code).toBe("SMILES");
    expect((await admin.call(settings.PUT, "PUT", "/s", { key: "registrationOpen", value: false })).status).toBe(200);
    expect((await new Client().call(register.POST, "POST", "/r", { name: "Zeca", email: "z@x.test", password: "senha-forte-1" })).status).toBe(403);
    expect((await admin.call(settings.PUT, "PUT", "/s", { key: "isAdmin", value: true })).status).toBe(400);
    const csv = await admin.call(exportRoute.GET, "GET", "/api/admin/export?kind=users");
    expect(csv.status).toBe(200);
    expect(String(csv.data)).toContain("n@x.test");
  });
});

describe("CSRF", () => {
  it("rejeita escrita vinda de outra origem", async () => {
    const evil = new Client("https://site-malicioso.test");
    evil.cookie = normal.cookie;
    expect((await evil.call(holders.POST, "POST", "/h", { name: "X" })).status).toBe(403);
    const same = new Client("http://localhost:3100");
    same.cookie = normal.cookie;
    expect((await same.call(holders.POST, "POST", "/h", { name: "X" })).status).toBe(201);
  });
});

describe("imagem do programa", () => {
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const send = async (who: Client, method: "PUT" | "DELETE", id: string, body?: Buffer) => {
    const { PUT, DELETE } = await import("@/app/api/admin/programs/[id]/logo/route");
    const req = new Request(`http://localhost:3100/api/admin/programs/${id}/logo`, { method, headers: { cookie: who.cookie }, body: body ? new Uint8Array(body) : undefined });
    return (method === "PUT" ? PUT : DELETE)(req, { params: Promise.resolve({ id }) });
  };
  const get = async (who: Client, id: string) => {
    const { GET } = await import("@/app/api/programs/[id]/logo/route");
    return GET(new Request(`http://localhost:3100/api/programs/${id}/logo`, { headers: { cookie: who.cookie } }), { params: Promise.resolve({ id }) });
  };

  it("admin envia, todos os usuários veem e o admin remove (auditado)", async () => {
    const p = await prisma.program.create({ data: { name: "Livelo", code: "LIV" } });
    expect((await get(normal, p.id)).status).toBe(404);
    expect((await send(normal, "PUT", p.id, PNG)).status).toBe(403);
    expect((await send(admin, "PUT", p.id, Buffer.from("não é imagem"))).status).toBe(415);
    expect((await send(admin, "PUT", p.id, PNG)).status).toBe(200);
    expect((await prisma.program.findUniqueOrThrow({ where: { id: p.id } })).logoUpdatedAt).not.toBeNull();
    const r = await get(normal, p.id);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(Buffer.from(await r.arrayBuffer()).equals(PNG)).toBe(true);
    expect((await get(new Client(), p.id)).status).toBe(401);
    expect((await send(admin, "DELETE", p.id)).status).toBe(200);
    expect((await get(normal, p.id)).status).toBe(404);
    expect(await prisma.auditLog.count({ where: { action: { in: ["admin.program_logo", "admin.program_logo_remove"] } } })).toBe(2);
  });
});
