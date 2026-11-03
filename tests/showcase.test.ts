// Vitrine de pacotes: cards a partir das cotações, página pública liga/desliga e isolamento.
import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, Client } from "./helpers";
import * as register from "@/app/api/auth/register/route";
import * as salesProfile from "@/app/api/sales-profile/route";
import * as showcase from "@/app/api/showcase/route";
import * as item from "@/app/api/showcase/[id]/route";
import * as move from "@/app/api/showcase/[id]/move/route";
import * as settings from "@/app/api/showcase/settings/route";
import * as suggest from "@/app/api/showcase/suggest/route";
import { publicShowcase, setShowcaseImage, showcaseImage } from "@/server/services/showcase";
import { prisma } from "@/server/db";
import { entryStage } from "@/server/services/pipelines";

let c: Client, o: Client;
let orderId: string;
beforeEach(async () => {
  await resetDb();
  c = new Client();
  o = new Client();
  const userId = (await c.call(register.POST, "POST", "/r", { name: "Ana", email: "ana@x.test", password: "senha-forte-1" })).data.user.id;
  await o.call(register.POST, "POST", "/r", { name: "Outro", email: "o@x.test", password: "senha-forte-2" });
  const ord = await prisma.travelOrder.create({
    data: {
      userId, stageId: (await entryStage(userId)).id, number: 3, customerName: "Maria Cliente", customerPhone: "(11) 99999-1234", adults: 2,
      segments: [{ origin: "GRU", destination: "LIS", date: "2027-03-10" }],
      proposal: { legs: [{ origin: "GRU", destination: "LIS", date: "2027-03-10", airline: "TAP" }, { origin: "LIS", destination: "GRU", date: "2027-03-20", airline: "TAP" }], baggage: { personal: 1, carryOn: 1, checked: 1 }, pixCents: 800000, cardInstallments: 10 },
    },
  });
  orderId = ord.id;
});

describe("vitrine", () => {
  it("sugere o card pela cotação sem dados do cliente, salva, reordena e isola por usuário", async () => {
    const list = (await c.call(showcase.GET, "GET", "/x")).data;
    expect(list.candidates).toMatchObject([{ id: orderId, number: 3, route: "GRU → LIS (ida e volta)" }]);
    const s = (await c.call(suggest.GET, "GET", `/api/showcase/suggest?pedido=${orderId}`)).data.item;
    expect(s).toMatchObject({ orderId, destination: "Lisboa", priceCents: 400000, priceNote: "por pessoa", installments: "ou em até 10x no cartão" });
    expect(s.includes).toEqual(["Aéreo ida e volta", "1 bagagem despachada", "Bagagem de mão", "TAP"]);
    expect(JSON.stringify(s)).not.toContain("Maria");
    expect((await o.call(suggest.GET, "GET", `/api/showcase/suggest?pedido=${orderId}`)).status).toBe(404);

    const a = (await c.call(showcase.POST, "POST", "/x", s)).data.id;
    const b = (await c.call(showcase.POST, "POST", "/x", { title: "Natal em família", destination: "Natal", includes: ["Hotel", "Hotel", " "] })).data.id;
    let items = (await c.call(showcase.GET, "GET", "/x")).data.items;
    expect(items.map((x: { id: string }) => x.id)).toEqual([b, a]); // o novo entra primeiro
    expect(items[0].includes).toEqual(["Hotel"]);
    await c.call(move.POST, "POST", "/x", { dir: 1 }, { id: b });
    items = (await c.call(showcase.GET, "GET", "/x")).data.items;
    expect(items.map((x: { id: string }) => x.id)).toEqual([a, b]);
    expect((await c.call(showcase.POST, "POST", "/x", { title: "", destination: "x" })).status).toBe(400);
    expect((await o.call(item.PUT, "PUT", "/x", { title: "hack", destination: "x" }, { id: a })).status).toBe(404);
    expect((await o.call(item.DELETE, "DELETE", "/x", undefined, { id: a })).status).toBe(404);
    expect((await o.call(showcase.GET, "GET", "/x")).data.items).toEqual([]);
  });

  it("página pública só com a vitrine ligada, e só os cards visíveis", async () => {
    // sem página da agência não dá para ligar
    expect((await c.call(settings.PUT, "PUT", "/x", { active: true })).status).toBe(400);
    await c.call(salesProfile.PATCH, "PATCH", "/api/sales-profile", { slug: "ana-viagens", published: true });
    const id = (await c.call(showcase.POST, "POST", "/x", { title: "Lisboa", destination: "Lisboa", priceCents: 400000 })).data.id;
    await c.call(showcase.POST, "POST", "/x", { title: "Oculto", destination: "Paris", active: false });
    expect(await publicShowcase("ana-viagens")).toBeNull();
    expect((await c.call(settings.PUT, "PUT", "/x", { active: true, title: "Pacotes de março" })).status).toBe(200);
    const pub = await publicShowcase("ana-viagens");
    expect(pub).toMatchObject({ title: "Pacotes de março", items: [{ id, title: "Lisboa", priceCents: 400000 }] });
    expect(pub!.items).toHaveLength(1);
    // foto do card: pública só com a vitrine ligada e a conta do dono ativa
    const png = Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010806000000", "hex");
    const owner = (await prisma.user.findFirstOrThrow({ where: { email: "ana@x.test" } })).id;
    await setShowcaseImage(owner, id, png);
    expect(await showcaseImage("ana-viagens", id)).toMatchObject({ mime: "image/png" });
    await prisma.user.update({ where: { id: owner }, data: { status: "DISABLED" } });
    expect(await publicShowcase("ana-viagens")).toBeNull();
    expect(await showcaseImage("ana-viagens", id)).toBeNull();
    await prisma.user.update({ where: { id: owner }, data: { status: "ACTIVE" } });
    await c.call(settings.PUT, "PUT", "/x", { active: false });
    expect(await publicShowcase("ana-viagens")).toBeNull();
    expect(await showcaseImage("ana-viagens", id)).toBeNull();
  });
});
