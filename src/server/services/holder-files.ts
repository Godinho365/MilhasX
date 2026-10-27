// Anexos do titular: contratos, comprovantes e outros documentos (PNG, JPEG, WEBP, HEIC ou PDF).
import { prisma, DomainError } from "../db";
import { detectImage } from "./extras";

export const MAX_FILES = 10;
export const MAX_BYTES = 10 * 1024 * 1024;

/** Tipo pelo conteúdo (assinatura do arquivo), nunca pela extensão ou pelo tipo informado. */
export function detectAttachment(buf: Buffer): string | null {
  const img = detectImage(buf);
  if (img) return img;
  if (buf.length >= 5 && buf.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf";
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp" && ["heic", "heix", "hevc", "mif1", "msf1"].includes(buf.subarray(8, 12).toString("ascii"))) return "image/heic";
  return null;
}

async function ownHolder(userId: string, holderId: string) {
  const h = await prisma.holder.findFirst({ where: { id: holderId, userId }, select: { id: true } });
  if (!h) throw new DomainError(404, "Titular não encontrado");
}

export async function listAttachments(userId: string, holderId: string) {
  await ownHolder(userId, holderId);
  return prisma.holderAttachment.findMany({ where: { holderId, userId }, select: { id: true, name: true, mime: true, size: true, createdAt: true }, orderBy: { createdAt: "asc" } });
}

export async function addAttachment(userId: string, holderId: string, name: string, buf: Buffer) {
  await ownHolder(userId, holderId);
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  if (buf.length > MAX_BYTES) throw new DomainError(413, "Arquivo maior que 10 MB");
  const mime = detectAttachment(buf);
  if (!mime) throw new DomainError(415, "Envie PNG, JPEG, WEBP, HEIC ou PDF");
  if ((await prisma.holderAttachment.count({ where: { holderId } })) >= MAX_FILES) throw new DomainError(409, `No máximo ${MAX_FILES} arquivos por titular`);
  // Nome só para exibição: sem caminhos nem caracteres de controle
  const clean = name.replace(/[\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "arquivo";
  return prisma.holderAttachment.create({
    data: { holderId, userId, name: clean, mime, size: buf.length, data: new Uint8Array(buf) },
    select: { id: true, name: true, mime: true, size: true, createdAt: true },
  });
}

export async function getAttachment(userId: string, holderId: string, id: string) {
  const a = await prisma.holderAttachment.findFirst({ where: { id, holderId, userId } });
  if (!a) throw new DomainError(404, "Anexo não encontrado");
  return { name: a.name, mime: a.mime, data: Buffer.from(a.data) };
}

export async function deleteAttachment(userId: string, holderId: string, id: string) {
  const { count } = await prisma.holderAttachment.deleteMany({ where: { id, holderId, userId } });
  if (!count) throw new DomainError(404, "Anexo não encontrado");
}
