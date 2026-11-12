// Detalhe da conta: recorrências (clubes) e credenciais criptografadas.
import { beneficiaryExpiry, beneficiaryKey, countDistinct, effectiveLimit, holderCpf, isAnonymous, windowStart, withoutHolder, type BeneficiaryWindow } from "@/domain/beneficiaries";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { EntryType, RecurrenceFrequency } from "@prisma/client";
import { prisma, DomainError, audit, log } from "../db";
import { verifyPassword } from "../auth";
import { createEntry, deleteEntry } from "./ledger";
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
  const [recent, pendingPoints, recurrences, credential] = await Promise.all([
    prisma.entry.findMany({ where: { accountId }, orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }], take: 6 }),
    prisma.entry.aggregate({ where: { accountId, status: "PENDING", points: { gt: 0 } }, _sum: { points: true } }),
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
              data: { category: "entries", userId, title: "Lançamento recorrente", body: `${r.description}: +${r.points.toLocaleString("pt-BR")} pontos em ${r.account.program.name}.` },
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
export async function revealCredential(userId: string, accountId: string, password: string, ip: string, actorId = userId) {
  await ownAccount(userId, accountId);
  // a senha conferida é a de quem pede (o dono ou o membro da equipe), e o limite de tentativas é por pessoa
  const tag = `reveal:${actorId}`;
  const fails = await prisma.loginAttempt.count({ where: { email: tag, success: false, createdAt: { gte: new Date(Date.now() - REVEAL_WINDOW) } } });
  if (fails >= 5) throw new DomainError(429, "Muitas tentativas. Aguarde alguns minutos.");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: actorId }, select: { passwordHash: true } });
  if (!(await verifyPassword(password, user.passwordHash))) {
    await prisma.loginAttempt.create({ data: { email: tag, ip, success: false } });
    throw new DomainError(401, "Senha incorreta");
  }
  const c = await prisma.accountCredential.findUnique({ where: { accountId } });
  if (!c) throw new DomainError(404, "Nenhuma credencial salva");
  await audit(prisma, actorId, "credential.reveal", "Account", accountId, actorId !== userId ? { workspace: userId } : undefined);
  return { login: decrypt(c.loginEnc), secret: decrypt(c.secretEnc), notes: c.notesEnc ? decrypt(c.notesEnc) : null };
}

export async function deleteCredential(userId: string, accountId: string) {
  await ownAccount(userId, accountId);
  await prisma.accountCredential.deleteMany({ where: { accountId } });
  await audit(prisma, userId, "credential.delete", "Account", accountId);
}

export { utcDate };

/* ---------------- Limite de beneficiários ---------------- */

export async function beneficiaryState(userId: string, accountId: string, now = new Date()) {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId }, include: { program: { select: { code: true } }, holder: { select: { name: true, documents: true } } } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  const eff = effectiveLimit(acc, acc.program.code);
  const since = windowStart(eff.window, now);
  const list = await prisma.accountBeneficiary.findMany({ where: { accountId }, orderBy: { usedAt: "desc" }, take: 500 });
  // O titular está sempre vinculado à conta e ocupa uma vaga fixa, que não vence
  const holder = { name: acc.holder.name, document: holderCpf(acc.holder.documents) };
  const others = withoutHolder(list, holder);
  const hk = beneficiaryKey(holder);
  return {
    limit: eff.limit,
    window: eff.window,
    suggested: eff.suggested,
    used: countDistinct(others, since) + 1,
    since: since.toISOString(),
    holder,
    items: list.map((b) => ({
      id: b.id, name: b.name, document: b.document, usedAt: b.usedAt.toISOString(), fromSale: !!b.saleId,
      inWindow: b.usedAt >= since, expiresAt: beneficiaryExpiry(eff.window, b.usedAt).toISOString(),
      isHolder: !others.includes(b) || beneficiaryKey(b) === hk,
    })),
  };
}

export async function setBeneficiaryLimit(userId: string, accountId: string, input: { limit: number | null; window: BeneficiaryWindow }) {
  const { count } = await prisma.account.updateMany({ where: { id: accountId, userId }, data: { beneficiaryLimit: input.limit, beneficiaryWindow: input.window } });
  if (!count) throw new DomainError(404, "Conta não encontrada");
}

export async function addBeneficiary(userId: string, accountId: string, input: { name: string; document?: string | null; usedAt: Date }) {
  const acc = await prisma.account.findFirst({ where: { id: accountId, userId }, select: { id: true } });
  if (!acc) throw new DomainError(404, "Conta não encontrada");
  const data = { name: input.name.trim(), document: input.document?.replace(/\D/g, "") || null };
  // Uma emissão sem nome deixou um "Anônimo" na conta: o nome informado depois toma o lugar dele
  // (de preferência o da mesma data), em vez de contar a mesma pessoa duas vezes
  const day = input.usedAt.toISOString().slice(0, 10);
  const anon = (await prisma.accountBeneficiary.findMany({ where: { accountId, userId }, orderBy: { usedAt: "asc" } })).filter(isAnonymous);
  const slot = anon.find((b) => b.usedAt.toISOString().slice(0, 10) === day) ?? anon[0];
  if (slot) return prisma.accountBeneficiary.update({ where: { id: slot.id }, data });
  return prisma.accountBeneficiary.create({ data: { userId, accountId, ...data, usedAt: input.usedAt } });
}

export async function removeBeneficiary(userId: string, accountId: string, id: string) {
  const b = await prisma.accountBeneficiary.findFirst({ where: { id, accountId, userId } });
  if (!b) throw new DomainError(404, "Beneficiário não encontrado");
  if (b.saleId) throw new DomainError(409, "Este beneficiário veio de uma venda; exclua a venda para tirá-lo da lista.");
  await prisma.accountBeneficiary.delete({ where: { id } });
}

/** CPFs usados na janela de cada conta (para a coluna "CPFs" da lista de programas). */
export async function beneficiaryUsage(userId: string, now = new Date()) {
  const accs = await prisma.account.findMany({ where: { userId }, select: { id: true, beneficiaryLimit: true, beneficiaryWindow: true, program: { select: { code: true } }, holder: { select: { name: true, documents: true } } } });
  const rows = await prisma.accountBeneficiary.findMany({ where: { userId, usedAt: { gte: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)) } }, select: { id: true, accountId: true, name: true, document: true, usedAt: true } });
  const out: Record<string, { used: number; limit: number | null }> = {};
  for (const a of accs) {
    const eff = effectiveLimit(a, a.program.code);
    if (eff.limit == null) continue;
    const mine = withoutHolder(rows.filter((r) => r.accountId === a.id), { name: a.holder.name, document: holderCpf(a.holder.documents) });
    out[a.id] = { used: countDistinct(mine, windowStart(eff.window, now)) + 1, limit: eff.limit }; // + titular
  }
  return out;
}
