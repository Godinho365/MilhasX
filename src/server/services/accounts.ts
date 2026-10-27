// Detalhe da conta: recorrências (clubes), compras bonificadas pendentes e credenciais criptografadas.
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EntryType, RecurrenceFrequency } from "@prisma/client";
import { prisma, DomainError, audit, log } from "../db";
import { verifyPassword } from "../auth";
import { createEntry, deleteEntry } from "./ledger";
import { detectAttachment } from "./holder-files";
import { cpmCents, marketValueCents, CREDIT_TYPES } from "@/domain/ledger";

async function ownAccount(userId: string, accountId: string) {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId }, include: { program: true, holder: true } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  return acc;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const utcDate = (s: string) => new Date(`${s}T00:00:00.000Z`);

/* ---------------- Detalhe da conta ---------------- */

export async function accountDetail(userId: string, accountId: string) {
  const acc = await ownAccount(userId, accountId);
  const [recent, pendingPoints, purchases, recurrences, credential] = await Promise.all([
    prisma.entry.findMany({ where: { accountId }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 6 }),
    prisma.entry.aggregate({ where: { accountId, status: "PENDING", points: { gt: 0 } }, _sum: { points: true } }),
    prisma.bonusPurchase.findMany({ where: { accountId, status: { in: ["PENDING", "DELIVERED"] } }, orderBy: { purchasedAt: "desc" } }),
    prisma.recurrence.findMany({ where: { accountId }, orderBy: { nextDate: "asc" } }),
    prisma.accountCredential.findUnique({ where: { accountId }, select: { updatedAt: true } }),
  ]);
  return {
    account: acc,
    stats: {
      balance: acc.balance,
      cpmCents: cpmCents(acc.costCents, acc.balance),
      pendingPoints: pendingPoints._sum.points ?? 0,
      marketValueCents: marketValueCents(acc.balance, acc.program.marketValueCpmCents),
    },
    recent,
    purchases,
    recurrences,
    credential: credential ? { updatedAt: credential.updatedAt } : null,
  };
}

/* ---------------- Recorrências ---------------- */

/** Próxima ocorrência: diária/semanal somam dias; mensal/trimestral/anual mantêm o dia (ou dayOfMonth), ajustando meses curtos. */
export function addPeriod(d: Date, f: RecurrenceFrequency, interval = 1, dayOfMonth?: number | null) {
  const n = new Date(d);
  if (f === "DAILY" || f === "WEEKLY") {
    n.setUTCDate(n.getUTCDate() + (f === "DAILY" ? 1 : 7) * interval);
    return n;
  }
  const months = (f === "MONTHLY" ? 1 : f === "QUARTERLY" ? 3 : 12) * interval;
  const day = dayOfMonth ?? n.getUTCDate();
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + months);
  const last = new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).getUTCDate();
  n.setUTCDate(Math.min(day, last)); // 31/jan → 28 ou 29/fev
  return n;
}

/** Fim de semana vai para a segunda-feira seguinte. */
export function skipWeekend(d: Date) {
  const n = new Date(d);
  const wd = n.getUTCDay();
  if (wd === 6) n.setUTCDate(n.getUTCDate() + 2);
  if (wd === 0) n.setUTCDate(n.getUTCDate() + 1);
  return n;
}

export interface RecurrenceInput {
  accountId: string;
  type: EntryType;
  description: string;
  points: number;
  costCents: number;
  frequency: RecurrenceFrequency;
  nextDate: Date;
  notify: boolean;
  interval?: number;
  dayOfMonth?: number | null;
  endDate?: Date | null;
  skipWeekends?: boolean;
}

export async function upsertRecurrence(userId: string, id: string | null, input: RecurrenceInput) {
  await ownAccount(userId, input.accountId);
  if (!CREDIT_TYPES.includes(input.type) || input.type === "TRANSFER_IN" || input.type === "TRANSFER_BONUS") {
    throw new DomainError(400, "Recorrência precisa ser um tipo de crédito");
  }
  if (input.endDate && input.endDate < input.nextDate) throw new DomainError(400, "A data de término precisa ser depois do início");
  const data = { ...input, description: input.description.trim(), interval: input.interval ?? 1 };
  if (id) {
    const r = await prisma.recurrence.findFirst({ where: { id, userId } });
    if (!r) throw new DomainError(404, "Recorrência não encontrada");
    return prisma.recurrence.update({ where: { id }, data });
  }
  return prisma.recurrence.create({ data: { ...data, userId } });
}

export async function patchRecurrence(userId: string, id: string, patch: { notify?: boolean; active?: boolean }) {
  const r = await prisma.recurrence.findFirst({ where: { id, userId } });
  if (!r) throw new DomainError(404, "Recorrência não encontrada");
  return prisma.recurrence.update({ where: { id }, data: patch });
}

export async function deleteRecurrence(userId: string, id: string) {
  const { count } = await prisma.recurrence.deleteMany({ where: { id, userId } });
  if (!count) throw new DomainError(404, "Recorrência não encontrada");
}

/**
 * Gera os lançamentos vencidos. Idempotente: cada ocorrência tem uma chave própria
 * (recorrência + data), então chamadas simultâneas não duplicam lançamentos.
 */
export async function processDueRecurrences(userId: string, today = new Date()) {
  const due = await prisma.recurrence.findMany({ where: { userId, active: true, nextDate: { lte: today } }, include: { account: { include: { program: true } } } });
  let created = 0;
  for (const r of due) {
    let next = r.nextDate;
    const occurrence = (d: Date) => (r.skipWeekends ? skipWeekend(d) : d);
    for (let guard = 0; next <= today && guard < 400; guard++) {
      if (r.endDate && next > r.endDate) break;
      try {
        const res = await createEntry(userId, {
          accountId: r.accountId,
          type: r.type as Parameters<typeof createEntry>[1]["type"],
          points: r.points,
          costCents: r.costCents,
          occurredAt: occurrence(next),
          description: `${r.description} (${day(occurrence(next)).split("-").reverse().join("/")})`,
          idempotencyKey: `rec:${r.id}:${day(next)}`,
        });
        if (!res.duplicated) {
          created++;
          if (r.notify) {
            await prisma.notification.create({
              data: { userId, title: "Lançamento recorrente", body: `${r.description}: +${r.points.toLocaleString("pt-BR")} pontos em ${r.account.program.name}.` },
            });
          }
        }
      } catch (e) {
        log("warn", "recurrence.failed", { recurrenceId: r.id, err: e instanceof Error ? e.message : String(e) });
        break;
      }
      next = addPeriod(next, r.frequency, r.interval, r.dayOfMonth);
    }
    // Só avança se ninguém avançou antes (evita corrida entre requisições)
    const ended = !!r.endDate && next > r.endDate;
    await prisma.recurrence.updateMany({ where: { id: r.id, nextDate: r.nextDate }, data: { nextDate: next, ...(ended ? { active: false } : {}) } });
  }
  return created;
}

/* ---------------- Compras bonificadas ---------------- */

export const expectedPurchasePoints = (amountCents: number, pointsPerRealX100: number) => Math.floor((amountCents / 100) * (pointsPerRealX100 / 100));

export interface PurchaseInput {
  accountId: string;
  storeId?: string | null;
  storeName: string;
  description?: string | null;
  purchasedAt: Date;
  amountCents: number;
  extraCostCents: number;
  costs?: { type: string; amountCents: number }[];
  pointsPerReal: number;
  expectedAt?: Date | null;
  expectedDeliveryAt?: Date | null;
  tags?: string[];
  notes?: string | null;
}

export const PURCHASE_COST_LABELS: Record<string, string> = { DIFERENCA_PRECO: "Diferença de preço", FRETE: "Frete", TAXAS: "Taxas", OUTROS: "Outros" };

export async function createPurchase(userId: string, input: PurchaseInput) {
  await ownAccount(userId, input.accountId);
  let storeName = input.storeName.trim();
  if (input.storeId) {
    const s = await prisma.store.findUnique({ where: { id: input.storeId } });
    if (!s) throw new DomainError(404, "Loja não encontrada");
    storeName = storeName || s.name;
  }
  // Sem loja parceira, a compra é identificada pela descrição
  storeName = storeName || input.description?.trim() || "Compra";
  const costs = input.costs?.filter((c) => c.amountCents > 0) ?? [];
  const { costs: _c, tags, ...rest } = input;
  return prisma.bonusPurchase.create({
    data: {
      ...rest,
      userId,
      storeName,
      storeId: input.storeId ?? null,
      description: input.description?.trim() || null,
      notes: input.notes?.trim() || null,
      extraCostCents: costs.length ? costs.reduce((t, c) => t + c.amountCents, 0) : input.extraCostCents,
      costs: costs.length ? costs : undefined,
      tags: [...new Set((tags ?? []).map((t) => t.trim()).filter(Boolean))],
      expectedPoints: expectedPurchasePoints(input.amountCents, input.pointsPerReal),
    },
  });
}

export function listPurchases(userId: string, status?: "PENDING" | "DELIVERED" | "RECEIVED" | "CANCELED") {
  return prisma.bonusPurchase.findMany({
    where: { userId, status },
    include: { account: { include: { program: true, holder: true } }, _count: { select: { attachments: true } } },
    orderBy: { purchasedAt: "desc" },
    take: 200,
  });
}

/** Pontos caíram: lança o crédito (custo = custo extra) e marca a compra como recebida. */
export async function receivePurchase(userId: string, id: string, input: { points?: number; receivedAt: Date }) {
  const p = await prisma.bonusPurchase.findFirst({ where: { id, userId } });
  if (!p) throw new DomainError(404, "Compra não encontrada");
  if (p.status !== "PENDING" && p.status !== "DELIVERED") throw new DomainError(409, "A compra não está aguardando pontos");
  const points = input.points ?? p.expectedPoints;
  if (!Number.isInteger(points) || points <= 0) throw new DomainError(400, "Informe os pontos recebidos");
  const { entry } = await createEntry(userId, {
    accountId: p.accountId,
    type: "PARTNER_PURCHASE",
    points,
    costCents: p.extraCostCents,
    occurredAt: input.receivedAt,
    description: p.storeId ? `Compra em ${p.storeName}` : p.description ?? `Compra em ${p.storeName}`,
    idempotencyKey: `purchase:${p.id}`,
  });
  // Só uma requisição consegue sair de PENDING
  const { count } = await prisma.bonusPurchase.updateMany({ where: { id: p.id, status: { in: ["PENDING", "DELIVERED"] } }, data: { status: "RECEIVED", entryId: entry.id, deliveredAt: p.deliveredAt ?? input.receivedAt } });
  if (!count) throw new DomainError(409, "A compra não está aguardando pontos");
  return entry;
}

/** Kanban: entre "Aguardando entrega" e "Aguardando pontos" (receber os pontos é outra ação). */
export async function movePurchase(userId: string, id: string, stage: "PENDING" | "DELIVERED", date?: Date) {
  const { count } = await prisma.bonusPurchase.updateMany({
    where: { id, userId, status: { in: ["PENDING", "DELIVERED"] } },
    data: { status: stage, deliveredAt: stage === "DELIVERED" ? (date ?? new Date()) : null },
  });
  if (!count) throw new DomainError(404, "Compra em andamento não encontrada");
}

/* Evidências da compra: prints, recibos ou vídeos (PNG, JPEG, WEBP, HEIC, PDF, MP4, MOV), 10 MB no total */
export const PURCHASE_MAX_FILES = 10;
export const PURCHASE_MAX_TOTAL = 10 * 1024 * 1024;

export function detectEvidence(buf: Buffer): string | null {
  const known = detectAttachment(buf);
  if (known) return known;
  if (buf.length >= 12 && buf.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("ascii");
    if (brand === "qt  ") return "video/quicktime";
    if (["isom", "iso2", "mp41", "mp42", "avc1", "M4V ", "dash"].includes(brand)) return "video/mp4";
  }
  return null;
}

async function ownPurchase(userId: string, purchaseId: string) {
  const p = await prisma.bonusPurchase.findFirst({ where: { id: purchaseId, userId }, select: { id: true } });
  if (!p) throw new DomainError(404, "Compra não encontrada");
}

export async function listPurchaseFiles(userId: string, purchaseId: string) {
  await ownPurchase(userId, purchaseId);
  return prisma.purchaseAttachment.findMany({ where: { purchaseId, userId }, select: { id: true, name: true, mime: true, size: true }, orderBy: { createdAt: "asc" } });
}

export async function addPurchaseFile(userId: string, purchaseId: string, name: string, buf: Buffer) {
  await ownPurchase(userId, purchaseId);
  if (buf.length === 0) throw new DomainError(400, "Arquivo vazio");
  const mime = detectEvidence(buf);
  if (!mime) throw new DomainError(415, "Envie PNG, JPEG, WEBP, HEIC, PDF, MP4 ou MOV");
  const agg = await prisma.purchaseAttachment.aggregate({ where: { purchaseId }, _count: true, _sum: { size: true } });
  if (agg._count >= PURCHASE_MAX_FILES) throw new DomainError(409, `No máximo ${PURCHASE_MAX_FILES} arquivos por compra`);
  if ((agg._sum.size ?? 0) + buf.length > PURCHASE_MAX_TOTAL) throw new DomainError(413, "As evidências da compra passam de 10 MB");
  const clean = name.replace(/[\\/]/g, "_").replace(/[\u0000-\u001f]/g, "").trim().slice(0, 120) || "arquivo";
  return prisma.purchaseAttachment.create({ data: { purchaseId, userId, name: clean, mime, size: buf.length, data: new Uint8Array(buf) }, select: { id: true, name: true, mime: true, size: true } });
}

export async function getPurchaseFile(userId: string, purchaseId: string, id: string) {
  const a = await prisma.purchaseAttachment.findFirst({ where: { id, purchaseId, userId } });
  if (!a) throw new DomainError(404, "Arquivo não encontrado");
  return { name: a.name, mime: a.mime, data: Buffer.from(a.data) };
}

export async function cancelPurchase(userId: string, id: string) {
  const { count } = await prisma.bonusPurchase.updateMany({ where: { id, userId, status: { in: ["PENDING", "DELIVERED"] } }, data: { status: "CANCELED" } });
  if (!count) throw new DomainError(404, "Compra em andamento não encontrada");
}

export async function deletePurchase(userId: string, id: string) {
  const p = await prisma.bonusPurchase.findFirst({ where: { id, userId } });
  if (!p) throw new DomainError(404, "Compra não encontrada");
  if (p.entryId) await deleteEntry(userId, p.entryId);
  await prisma.bonusPurchase.delete({ where: { id } });
}

/* ---------------- Credenciais (AES-256-GCM) ---------------- */

function key() {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) return null;
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new DomainError(500, "CREDENTIALS_KEY precisa ter 32 bytes em base64");
  return k;
}

export const credentialsEnabled = () => !!process.env.CREDENTIALS_KEY;

export function encrypt(text: string) {
  const k = key();
  if (!k) throw new DomainError(503, "Credenciais desativadas: defina CREDENTIALS_KEY no servidor");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), data.toString("base64")].join(".");
}

export function decrypt(payload: string) {
  const k = key();
  if (!k) throw new DomainError(503, "Credenciais desativadas: defina CREDENTIALS_KEY no servidor");
  const [v, iv, tag, data] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !data) throw new DomainError(500, "Credencial em formato desconhecido");
  const d = createDecipheriv("aes-256-gcm", k, Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}

export async function saveCredential(userId: string, accountId: string, input: { login: string; secret: string; notes?: string | null }) {
  await ownAccount(userId, accountId);
  const data = { loginEnc: encrypt(input.login), secretEnc: encrypt(input.secret), notesEnc: input.notes ? encrypt(input.notes) : null };
  await prisma.accountCredential.upsert({ where: { accountId }, update: data, create: { ...data, accountId } });
  await audit(prisma, userId, "credential.save", "Account", accountId);
}

const REVEAL_WINDOW = 15 * 60 * 1000;

/** Mostra login e senha só após confirmar a senha do usuário; tentativas erradas são limitadas e tudo é auditado. */
export async function revealCredential(userId: string, accountId: string, password: string, ip: string) {
  await ownAccount(userId, accountId);
  const tag = `reveal:${userId}`;
  const fails = await prisma.loginAttempt.count({ where: { email: tag, success: false, createdAt: { gte: new Date(Date.now() - REVEAL_WINDOW) } } });
  if (fails >= 5) throw new DomainError(429, "Muitas tentativas. Aguarde alguns minutos.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    await prisma.loginAttempt.create({ data: { email: tag, ip, success: false } });
    throw new DomainError(401, "Senha incorreta");
  }
  const c = await prisma.accountCredential.findUnique({ where: { accountId } });
  if (!c) throw new DomainError(404, "Nenhuma credencial salva");
  await audit(prisma, userId, "credential.reveal", "Account", accountId);
  return { login: decrypt(c.loginEnc), secret: decrypt(c.secretEnc), notes: c.notesEnc ? decrypt(c.notesEnc) : null };
}

export async function deleteCredential(userId: string, accountId: string) {
  await ownAccount(userId, accountId);
  await prisma.accountCredential.deleteMany({ where: { accountId } });
  await audit(prisma, userId, "credential.delete", "Account", accountId);
}

export { utcDate };
