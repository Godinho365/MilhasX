// Seletor global de titular: a rota só valida e grava o cookie (a tela recarrega sozinha)
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as holders from "@/app/api/holders/route";
import * as self from "@/app/api/holders/[id]/self/route";
import * as choice from "@/app/api/preferences/holder/route";

let c: Client;
let session: string;
let holderId: string;

/** Troca o titular e devolve status, erro e o Set-Cookie, mantendo a sessão do cliente. */
async function pick(value: unknown, as = c) {
  const req = new Request("http://localhost:3100/api/preferences/holder", {
    method: "PUT",
    headers: { "content-type": "application/json", ...(as.cookie ? { cookie: as.cookie } : {}) },
    body: JSON.stringify({ value }),
  });
  const res = await choice.PUT(req, { params: Promise.resolve({}) });
  return { status: res.status, data: await res.json(), cookie: res.headers.get("set-cookie") ?? "" };
}

beforeEach(async () => {
  await resetDb();
  c = new Client();
  await c.call(register.POST, "POST", "/r", { name: "Gestor", email: "gestor@x.test", password: "senha-forte-1" });
  session = c.cookie;
  holderId = (await c.call(holders.POST, "POST", "/api/holders", { name: "Carlos Lima" })).data.item.id;
});

describe("seletor de titular", () => {
  it("grava o titular escolhido e apaga o cookie ao voltar para todos", async () => {
    const r = await pick(holderId);
    expect(r.status).toBe(200);
    expect(r.cookie).toMatch(new RegExp(`^mm_holder=${holderId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000`));
    const all = await pick("");
    expect(all.status).toBe(200);
    expect(all.cookie).toBe("mm_holder=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
    expect(c.cookie).toBe(session);
  });

  it("minhas contas exige um titular marcado como você", async () => {
    const r = await pick("self");
    expect(r.status).toBe(404);
    expect(r.data.erro).toMatch(/qual titular é você/);
    expect(r.cookie).toBe("");
    await c.call(self.POST, "POST", "/x", { isSelf: true }, { id: holderId });
    expect((await pick("self")).cookie).toMatch(/^mm_holder=self;/);
  });

  it("não aceita titular de outro usuário nem pedido sem sessão", async () => {
    const other = new Client();
    await other.call(register.POST, "POST", "/r", { name: "Outro", email: "outro@x.test", password: "senha-forte-1" });
    const r = await pick(holderId, other);
    expect(r.status).toBe(404);
    expect(r.data.erro).toBe("Titular não encontrado");
    expect(r.cookie).toBe("");
    expect((await pick(holderId, new Client())).status).toBe(401);
    expect((await pick(123)).status).toBe(400);
  });
});
