import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/db";
import { resetDb } from "./helpers";

// Chat Balcões em tempo real, etapa 1: as garantias que o banco dá ao listener (sem duplicar, um chat por
// mensagem, limpeza junto com o grupo/conversa e eventos em ordem).

async function setup() {
  const user = await prisma.user.create({ data: { name: "Ana", email: `ana-${Date.now()}@x.test`, passwordHash: "x" } });
  const link = await prisma.telegramLink.create({ data: { userId: user.id, sessionEnc: "x", status: "ACTIVE", phone: "+5511999998888" } });
  const group = await prisma.telegramGroup.create({ data: { userId: user.id, linkId: link.id, groupId: "-1001234", title: "Balcão" } });
  const dm = await prisma.telegramDm.create({ data: { userId: user.id, linkId: link.id, peerId: "u1", peerHash: "h1", name: "Bia" } });
  return { user, link, group, dm };
}
const base = (userId: string, linkId: string) => ({ userId, linkId, date: new Date(), senderName: "Bia", text: "Compro 100k LATAM 25" });

describe("Chat Balcões em tempo real: armazenamento das mensagens", () => {
  beforeEach(resetDb);

  it("a mesma mensagem do mesmo chat não duplica: o upsert pela chave (chat, número) atualiza", async () => {
    const { user, link, group } = await setup();
    const key = { groupId_msgId: { groupId: group.id, msgId: 10 } };
    await prisma.telegramMessage.upsert({ where: key, create: { ...base(user.id, link.id), groupId: group.id, msgId: 10 }, update: {} });
    await prisma.telegramMessage.upsert({ where: key, create: { ...base(user.id, link.id), groupId: group.id, msgId: 10 }, update: { text: "Compro 100k LATAM 24", editDate: new Date() } });
    const rows = await prisma.telegramMessage.findMany({ where: { groupId: group.id } });
    expect(rows.map((r) => [r.msgId, r.text])).toEqual([[10, "Compro 100k LATAM 24"]]);
    // insert direto repetido é barrado pelo banco
    await expect(prisma.telegramMessage.create({ data: { ...base(user.id, link.id), groupId: group.id, msgId: 10 } })).rejects.toThrow();
  });

  it("o mesmo número em chats diferentes são mensagens diferentes", async () => {
    const { user, link, group, dm } = await setup();
    await prisma.telegramMessage.create({ data: { ...base(user.id, link.id), groupId: group.id, msgId: 7 } });
    await prisma.telegramMessage.create({ data: { ...base(user.id, link.id), dmId: dm.id, msgId: 7 } });
    expect(await prisma.telegramMessage.count()).toBe(2);
  });

  it("cada mensagem é de exatamente um chat", async () => {
    const { user, link, group, dm } = await setup();
    await expect(prisma.telegramMessage.create({ data: { ...base(user.id, link.id), msgId: 1 } })).rejects.toThrow(); // nenhum
    await expect(prisma.telegramMessage.create({ data: { ...base(user.id, link.id), groupId: group.id, dmId: dm.id, msgId: 1 } })).rejects.toThrow(); // os dois
  });

  it("tirar o grupo ou a conversa do app apaga as mensagens gravadas dela", async () => {
    const { user, link, group, dm } = await setup();
    await prisma.telegramMessage.create({ data: { ...base(user.id, link.id), groupId: group.id, msgId: 1 } });
    await prisma.telegramMessage.create({ data: { ...base(user.id, link.id), dmId: dm.id, msgId: 2 } });
    await prisma.telegramGroup.delete({ where: { id: group.id } });
    expect((await prisma.telegramMessage.findMany()).map((m) => m.msgId)).toEqual([2]);
    await prisma.telegramLink.delete({ where: { id: link.id } }); // desconectar a conta leva tudo
    expect(await prisma.telegramMessage.count()).toBe(0);
  });

  it("eventos ficam em ordem pelo id e dá para pedir só os depois de um id", async () => {
    const { user, group } = await setup();
    const ev = (msgId: number, type: string) => prisma.telegramEvent.create({ data: { userId: user.id, type, chatKind: "GROUP", chatId: group.id, msgId } });
    const a = await ev(1, "message.new");
    await ev(1, "message.edit");
    await ev(2, "message.new");
    const after = await prisma.telegramEvent.findMany({ where: { userId: user.id, id: { gt: a.id } }, orderBy: { id: "asc" } });
    expect(after.map((e) => [e.type, e.msgId])).toEqual([["message.edit", 1], ["message.new", 2]]);
    expect(typeof a.id).toBe("bigint");
  });
});
