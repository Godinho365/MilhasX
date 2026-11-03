// Detalhes do cartão como na referência: lembretes, anexos e atividade (comentários e histórico).
import { prisma, DomainError } from "../db";
import { detectAttachment, MAX_BYTES, MAX_FILES } from "./holder-files";
import { REMINDER_KINDS, type ReminderKind, type ReminderRecurrence } from "@/domain/card-catalog";

async function ownCard(userId: string, id: string) {
  const c = await prisma.creditCard.findFirst({ where: { id, userId }, select: { id: true } });
  if (!c) throw new DomainError(404, "Cartão não encontrado");
  return c;
}
const day = (d: Date) => d.toISOString().slice(0, 10);
const log = (cardId: string, text: string) => prisma.cardActivity.create({ data: { cardId, kind: "ACTIVITY", text } });

export async function cardDetail(userId: string, id: string) {
  await ownCard(userId, id);
  const [reminders, files, activity] = await Promise.all([
    prisma.cardReminder.findMany({ where: { cardId: id }, orderBy: { date: "asc" } }),
    prisma.cardAttachment.findMany({ where: { cardId: id }, select: { id: true, name: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } }),
    prisma.cardActivity.findMany({ where: { cardId: id }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  return {
    reminders: reminders.map((r) => ({ id: r.id, kind: r.kind, title: r.title, date: day(r.date), recurrence: r.recurrence, advanceDays: r.advanceDays, whatsapp: r.whatsapp, note: r.note })),
    files: files.map((f) => ({ ...f, createdAt: f.createdAt.toISOString() })),
    activity: activity.map((a) => ({ id: a.id, kind: a.kind, text: a.text, createdAt: a.createdAt.toISOString() })),
  };
}

export type ReminderInput = { kind: ReminderKind; title: string; date: Date; recurrence: ReminderRecurrence; advanceDays: number; whatsapp: boolean; note?: string | null };

export async function addCardReminder(userId: string, cardId: string, input: ReminderInput) {
  await ownCard(userId, cardId);
  const r = await prisma.cardReminder.create({ data: { cardId, ...input, title: input.title.trim(), note: input.note?.trim() || null } });
  await log(cardId, `Lembrete: ${r.title} (${REMINDER_KINDS[input.kind]})`);
  return r.id;
}

export async function deleteCardReminder(userId: string, cardId: string, id: string) {
  await ownCard(userId, cardId);
  const r = await prisma.cardReminder.findFirst({ where: { id, cardId } });
  if (!r) throw new DomainError(404, "Lembrete não encontrado");
  await prisma.cardReminder.delete({ where: { id } });
  await log(cardId, `Lembrete removido: ${r.title}`);
}

/** Lembretes dos próximos dias de todos os cartões (aviso na Central de Cartões), já descontando a antecedência. */
export async function upcomingCardReminders(userId: string, today: string, days = 30) {
  const until = new Date(new Date(`${today}T00:00:00Z`).getTime() + days * 86_400_000);
  const rows = await prisma.cardReminder.findMany({ where: { card: { userId }, date: { lte: until } }, include: { card: { select: { id: true, name: true } } }, orderBy: { date: "asc" } });
  return rows.map((r) => ({ id: r.id, cardId: r.card.id, card: r.card.name, title: r.title, date: day(r.date), advanceDays: r.advanceDays, late: day(r.date) < today }));
}

export async function addCardComment(userId: string, cardId: string, text: string) {
  await ownCard(userId, cardId);
  await prisma.cardActivity.create({ data: { cardId, kind: "COMMENT", text: text.trim() } });
}

export async function addCardFile(userId: string, cardId: string, name: string, buf: Buffer) {
  await ownCard(userId, cardId);
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_BYTES) throw new DomainError(413, "Arquivo maior que 10 MB");
  const mime = detectAttachment(buf);
  if (!mime) throw new DomainError(415, "Envie PNG, JPEG, WEBP, HEIC ou PDF");
  if ((await prisma.cardAttachment.count({ where: { cardId } })) >= MAX_FILES) throw new DomainError(409, `No máximo ${MAX_FILES} arquivos por cartão`);
  const clean = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "arquivo";
  await prisma.cardAttachment.create({ data: { cardId, name: clean, mime, size: buf.length, data: new Uint8Array(buf) } });
  await log(cardId, `Anexo: ${clean}`);
}

export async function getCardFile(userId: string, cardId: string, id: string) {
  await ownCard(userId, cardId);
  const a = await prisma.cardAttachment.findFirst({ where: { id, cardId } });
  if (!a) throw new DomainError(404, "Anexo não encontrado");
  return { name: a.name, mime: a.mime, data: Buffer.from(a.data) };
}

export async function deleteCardFile(userId: string, cardId: string, id: string) {
  await ownCard(userId, cardId);
  const a = await prisma.cardAttachment.findFirst({ where: { id, cardId }, select: { name: true } });
  if (!a) throw new DomainError(404, "Anexo não encontrado");
  await prisma.cardAttachment.delete({ where: { id } });
  await log(cardId, `Anexo removido: ${a.name}`);
}
