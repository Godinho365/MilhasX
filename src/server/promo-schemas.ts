import { z } from "zod";

const date = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida").transform((d) => new Date(`${d}T23:59:59-03:00`));
const optInt = z.union([z.number().int(), z.null()]).default(null);

// Cupom: valor em % (1-100) ou em centavos por cobrança; validade até o fim do dia (Brasília)
export const couponSchema = z.object({
  code: z.string().trim().min(3).max(30),
  kind: z.enum(["PERCENT", "FIXED"]),
  value: z.number().int().min(1),
  plans: z.array(z.enum(["PRO", "GESTOR"])).default([]),
  intervals: z.array(z.enum(["MENSAL", "ANUAL"])).default([]),
  maxUses: optInt,
  expiresAt: z.union([date, z.null()]).default(null),
  note: z.string().trim().max(200).nullable().default(null),
});

export const inviteSchema = z.object({
  code: z.string().trim().min(3).max(30),
  kind: z.enum(["PLAN", "TRIAL"]),
  plan: z.enum(["PRO", "GESTOR"]).nullable().default(null),
  interval: z.enum(["MENSAL", "ANUAL"]).nullable().default(null),
  days: optInt,
  maxUses: optInt,
  expiresAt: z.union([date, z.null()]).default(null),
  note: z.string().trim().max(200).nullable().default(null),
});

export const activeSchema = z.object({ active: z.boolean() });
