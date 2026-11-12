import { z } from "zod";
import { MANUAL_CREDIT_TYPES, MANUAL_DEBIT_TYPES, CREDIT_TYPES, DEBIT_TYPES, type EntryType } from "@/domain/ledger";
import { BALCAO_PROGRAMS } from "@/domain/balcao-ads";

type ManualType = (typeof MANUAL_CREDIT_TYPES)[number] | (typeof MANUAL_DEBIT_TYPES)[number];
const MANUAL = [...MANUAL_CREDIT_TYPES, ...MANUAL_DEBIT_TYPES] as [ManualType, ...ManualType[]];
const ALL_TYPES = [...CREDIT_TYPES, ...DEBIT_TYPES] as [EntryType, ...EntryType[]];

export const id = z.string().min(1).max(64);
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
  .transform((s) => new Date(`${s}T00:00:00.000Z`))
  .refine((d) => !Number.isNaN(d.getTime()), "Data inválida");
const points = z.number({ invalid_type_error: "Informe os pontos" }).int("Pontos devem ser inteiros").positive("Pontos devem ser maiores que zero").max(1_000_000_000);
const cents = z.number().int().min(0, "Valor não pode ser negativo").max(100_000_000_00);
const key = z.string().uuid().optional().nullable();

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome").max(100),
  email: z.string().trim().email("E-mail inválido").max(200),
  password: z.string().min(8, "A senha precisa ter pelo menos 8 caracteres").max(128),
  ref: z.string().trim().max(20).optional(),
  // Telefone com DDD (só os dígitos são guardados; aceita +55 na frente)
  phone: z
    .string()
    .trim()
    .max(30)
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v === "" || (v.length >= 10 && v.length <= 13), "Telefone inválido: informe DDD e número")
    .optional(),
  acceptTerms: z.boolean().optional(),
  captcha: z.string().max(4096).optional(),
  // Código de 6 dígitos mandado ao e-mail (exigido quando o envio de e-mail está configurado)
  code: z.string().trim().max(20).optional(),
});
export const loginSchema = z.object({ email: z.string().trim().min(1).max(200), password: z.string().min(1).max(128) });
export const forgotSchema = z.object({ email: z.string().trim().email("E-mail inválido").max(200) });
export const resetSchema = z.object({ token: z.string().min(10).max(200), password: z.string().min(8).max(128) });
export const changePasswordSchema = z.object({ current: z.string().min(1).max(128), next: z.string().min(8).max(128) });

export const holderSchema = z.object({ name: z.string().trim().min(1, "Informe o nome").max(80) });
/** Cadastro completo do titular (como "Editar titular" da referência). Nada de senhas aqui. */
export const holderDetailsSchema = holderSchema.extend({
  birthDate: dateStr.optional().nullable().or(z.literal("").transform(() => null)),
  documents: z
    .array(z.object({ type: z.enum(["CPF", "CNPJ", "RG", "PASSAPORTE"]), number: z.string().trim().min(1, "Informe o número do documento").max(30) }))
    .max(10)
    .optional(),
  address: z.string().trim().max(300).optional().nullable(),
  addressParts: z
    .object({
      cep: z.string().trim().regex(/^(\d{5}-?\d{3})?$/, "CEP inválido").optional(),
      logradouro: z.string().trim().max(120).optional(),
      numero: z.string().trim().max(20).optional(),
      complemento: z.string().trim().max(60).optional(),
      bairro: z.string().trim().max(60).optional(),
      cidade: z.string().trim().max(60).optional(),
      uf: z.string().trim().regex(/^([A-Z]{2})?$/, "UF inválida").optional(),
    })
    .strict()
    .optional()
    .nullable(),
  accessEmail: z.string().trim().toLowerCase().email("E-mail inválido").max(120).optional().nullable().or(z.literal("").transform(() => null)),
  phone: z.string().trim().max(30).refine((v) => !v || v.replace(/\D/g, "").length >= 10, "Telefone com DDD").optional().nullable().or(z.literal("").transform(() => null)),
  attributes: z.array(z.object({ key: z.string().trim().min(1, "Informe o nome do atributo").max(40), value: z.string().trim().max(200) })).max(20).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
export const accountSchema = z.object({ holderId: id, programId: id });
export const accountPatchSchema = z.object({
  transferBonusPct: z.number().int().min(0).max(300).optional().nullable(), // bônus em transferências com o clube ativo
  transferBonusCap: z.number().int().min(0).max(10_000_000).optional().nullable(), // limite de milhas de bônus por mês
  nickname: z.string().trim().max(60).optional().nullable(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  cpfAvailable: z.number().int().min(0).max(1000).optional().nullable(),
});

const COST_ENUM = ["PONTOS", "IOF", "OUTROS", "FRETE", "MARKUP", "MENSALIDADE", "ANUIDADE", "TAXA_EMBARQUE", "COMPLETAR_PONTOS"] as const;
export const costItemSchema = z.object({ type: z.enum(COST_ENUM), amountCents: z.number().int().min(0).max(100_000_000_00), cardId: id.optional().nullable() });
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal(""));
// compra parcelada: valor cheio, quanto de fato foi pago (com antecipação) e o desconto
export const paymentSchema = z.object({ installments: z.number().int().min(2).max(12), anticipated: z.boolean(), nominalCents: cents, paidCents: cents, discountCents: cents }).strict();
export const detailsSchema = z
  .object({
    cashReferenceCents: z.number().int().min(0).max(100_000_000_00).optional().nullable(),
    passengers: z.number().int().min(1).max(99).optional().nullable(),
    reservation: z.string().trim().max(40).optional().nullable(),
    origin: z.string().trim().regex(/^[A-Z]{3}$/, "Aeroporto inválido").optional().nullable().or(z.literal("")),
    destination: z.string().trim().regex(/^[A-Z]{3}$/, "Aeroporto inválido").optional().nullable().or(z.literal("")),
    startDate: optDate,
    endDate: optDate,
    payment: paymentSchema.optional().nullable(),
  })
  .strict();
export const recurrenceOptionsSchema = z.object({
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  interval: z.number().int().min(1).max(365).default(1),
  dayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  endDate: dateStr.optional().nullable(),
  skipWeekends: z.boolean().default(false),
});

export const entrySchema = z.object({
  accountId: id,
  type: z.enum(MANUAL),
  points,
  costCents: cents.optional(),
  costs: z.array(costItemSchema).max(20).optional(),
  details: detailsSchema.optional().nullable(),
  recurrence: recurrenceOptionsSchema.optional().nullable(),
  occurredAt: dateStr,
  description: z.string().trim().max(200).optional(),
  reference: z.string().trim().max(120).optional().nullable(),
  status: z.enum(["CONFIRMED", "PENDING"]).optional(),
  idempotencyKey: key,
});
export const entryPatchSchema = z.object({
  points: points.optional(),
  costCents: cents.optional(),
  costs: z.array(costItemSchema).max(20).optional(),
  payment: paymentSchema.optional().nullable(), // null = deixou de ser parcelado
  occurredAt: dateStr.optional(),
  description: z.string().trim().max(200).optional(),
  status: z.enum(["CONFIRMED", "PENDING"]).optional(),
});
export const transferSchema = z.object({
  fromAccountId: id,
  toAccountId: id,
  points,
  bonusPercent: z.number().min(0).max(300),
  occurredAt: dateStr,
  description: z.string().trim().max(200).optional().nullable(),
  parityFrom: z.number().int().min(1).max(1000).default(1),
  parityTo: z.number().int().min(1).max(1000).default(1),
  feeCents: cents.default(0),
  purchase: z
    .object({
      points: points,
      priceCents: cents,
      applyAll: z.boolean().default(false),
      payment: paymentSchema.optional().nullable(),
    })
    .optional()
    .nullable(),
  deliveryDate: dateStr.optional().nullable(),
  idempotencyKey: key,
});
const iata = z.string().trim().regex(/^[A-Z]{3}$/, "Aeroporto inválido").optional().nullable().or(z.literal("").transform(() => null));
const optDay = dateStr.optional().nullable().or(z.literal("").transform(() => null));
export const saleItemSchema = z.object({
  kind: z.enum(["FLIGHT", "BAGGAGE", "SEAT", "HOTEL", "CAR", "OTHER"]),
  issuedWith: z.enum(["POINTS", "CASH"]).default("POINTS"),
  points: z.number().int().min(0).max(1_000_000_000).default(0),
  salePriceCents: cents,
  cashCostCents: cents.default(0),
  costs: z.array(z.object({ type: z.enum(["TAXA_EMBARQUE", "IOF", "BAGAGEM", "ASSENTO", "COMPLETAR_PONTOS", "OUTROS"]), amountCents: cents, cardId: id.optional().nullable() })).max(20).default([]),
  clientType: z.enum(["FINAL", "AGENCY"]).default("FINAL"),
  customerIds: z.array(id).max(20).default([]),
  passengers: z.number().int().min(1).max(99).optional().nullable(),
  reservation: z.string().trim().max(40).optional().nullable(),
  origin: iata,
  destination: iata,
  departureDate: optDay,
  returnDate: optDay,
  description: z.string().trim().max(200).optional().nullable(),
  observation: z.string().trim().max(2000).optional().nullable(),
});
export const saleSchema = z.object({
  origin: z.enum(["OWN", "SUPPLIER"]).default("OWN"),
  accountId: id.optional().nullable(),
  supplierAccountId: id.optional().nullable(),
  occurredAt: dateStr,
  items: z.array(saleItemSchema).min(1, "Adicione um item à venda").max(20),
  idempotencyKey: key,
});
export const saleQuerySchema = z.object({
  q: z.string().max(100).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  programId: id.optional(),
  customerId: id.optional(),
  pago: z.enum(["sim", "nao"]).optional(),
  tag: z.string().trim().min(1).max(30).optional(),
  sort: z.enum(["occurredAt", "points", "totalCents"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});
const docNumber = z.string().trim().min(1, "Informe o número do documento").max(30);
export const customerSchema = z
  .object({
    name: z.string().trim().min(1, "Informe o nome").max(100),
    kind: z.enum(["FINAL", "AGENCY"]).default("FINAL"),
    docType: z.enum(["CPF", "CNPJ"]).optional().nullable(),
    docNumber: z.string().trim().max(30).optional().nullable(),
    email: z.string().trim().toLowerCase().email("E-mail inválido").max(120).optional().nullable().or(z.literal("").transform(() => null)),
    phone: z.string().trim().max(30).optional().nullable(),
    contact: z.string().trim().max(120).optional().nullable(),
    documents: z.array(z.object({ type: z.enum(["CPF", "CNPJ", "RG", "PASSAPORTE"]), number: docNumber })).max(10).default([]),
  })
  .refine((c) => !c.docType || !!c.docNumber, { message: "Informe o número do identificador", path: ["docNumber"] });
export const alertSchema = z.object({
  type: z.literal("MIN_BALANCE"),
  accountId: id.optional(),
  threshold: z.number().int().min(0, "Limite inválido"),
});
const channel = z.object({ email: z.boolean().optional(), push: z.boolean().optional() });
export const preferenceSchema = z.object({
  showValues: z.boolean().optional(),
  checklistHidden: z.boolean().optional(),
  dashboardView: z.enum(["visao-geral", "vendas", "gestao"]).optional(),
  soundEffects: z.boolean().optional(),
  usageAnalytics: z.boolean().optional(),
  hideVideoTutorials: z.boolean().optional(),
  valuesMode: z.enum(["VISIBLE", "PARTIAL", "HIDDEN"]).optional(),
  notifications: z.record(z.enum(["points", "entries", "marketing", "system", "billing"]), channel).optional(),
  // dados do PIX para a mensagem de cobrança do CRM Milhas (null apaga)
  pix: z
    .object({
      keyType: z.enum(["CPF", "CNPJ", "EMAIL", "TELEFONE", "ALEATORIA"]),
      key: z.string().trim().min(1, "Informe a chave PIX").max(140),
      name: z.string().trim().max(100).default(""),
      bank: z.string().trim().max(60).default(""),
      city: z.string().trim().max(60).optional(), // cidade do recebedor, para o PIX copia e cola (QR)
    })
    .nullable()
    .optional(),
  // termo de emissão mandado ao comprador antes de emitir (null ou vazio = o padrão do MilhasX)
  emissionTerms: z.string().trim().max(4000, "Termo longo demais (até 4.000 caracteres)").nullable().optional(),
});
// termo de emissão: com text, manda no privado do Telegram (negociação do Chat Balcões); sem, só marca como enviado
export const dealTermsSchema = z.object({ text: z.string().trim().min(1, "Escreva o termo").max(4000, "Termo longo demais (até 4.000 caracteres)").optional() });
// mensagem de emissão enviada em 1 clique no privado do Telegram (negociação do Chat Balcões)
export const telegramMessageSchema = z.object({ text: z.string().trim().min(1, "Escreva a mensagem").max(4096, "Mensagem longa demais (até 4.096 caracteres)") });
export const profileSchema = z.object({ name: z.string().trim().min(2, "Informe seu nome").max(100) });
export const planRequestSchema = z.object({ plan: z.enum(["PESSOAL", "PRO", "GESTOR"]), interval: z.enum(["MENSAL", "ANUAL"]).default("MENSAL") });
export const adminPlanSchema = z.object({ plan: z.enum(["PESSOAL", "PRO", "GESTOR"]), interval: z.enum(["MENSAL", "ANUAL"]).nullable().default(null) });
export const salesProfileSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3, "Mínimo de 3 caracteres").max(40).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use letras minúsculas, números e hífen"),
  displayName: z.string().trim().min(2, "Informe o nome de exibição").max(80),
  bio: z.string().trim().max(500).nullable().optional(),
  whatsapp: z.string().trim().max(20).regex(/^[\d\s()+-]*$/, "WhatsApp inválido").nullable().optional(),
  instagram: z.string().trim().max(31).regex(/^@?[A-Za-z0-9._]*$/, "Instagram inválido").nullable().optional(),
  email: z.union([z.string().trim().email("E-mail inválido").max(200), z.literal("")]).nullable().optional(),
  programIds: z.array(z.string().min(1).max(40)).max(50).default([]),
  published: z.boolean().default(false),
  acceptsOrders: z.boolean().default(true),
  acceptsLeads: z.boolean().default(true),
  headline: z.string().trim().max(120).nullable().optional(),
  // Personalização: formato livre aqui, normalizado por resolveDesign (domain/page-design.ts)
  design: z.record(z.unknown()).refine((d) => JSON.stringify(d).length <= 20_000, "Personalização grande demais").optional(),
});

export const salesPublicationSchema = salesProfileSchema.pick({ slug: true, published: true });

export const programSchema = z.object({
  name: z.string().trim().min(1).max(80),
  code: z.string().trim().min(2).max(20).regex(/^[A-Za-z0-9_-]+$/, "Sigla inválida"),
  kind: z.enum(["POINTS", "MILES"]),
  active: z.boolean(),
  marketValueCpmCents: cents,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").default("#3b82f6"),
});
export const userStatusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });
export const settingSchema = z.object({
  key: z.string(),
  value: z.union([z.boolean(), z.string().max(500), z.number()]),
});

/** Converte query string em filtros do extrato. */
export const entryQuerySchema = z.object({
  holderId: id.optional(),
  programId: id.optional(),
  accountId: id.optional(),
  type: z.enum(ALL_TYPES).optional(),
  direction: z.enum(["credit", "debit"]).optional(),
  status: z.enum(["CONFIRMED", "PENDING"]).optional(),
  from: dateStr.optional(),
  to: dateStr.optional(),
  q: z.string().max(100).optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).optional(),
  sort: z.enum(["occurredAt", "points", "costCents"]).optional(),
  order: z.enum(["asc", "desc"]).optional(),
  cardId: id.optional(),
  minPoints: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  maxPoints: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  minCost: z.coerce.number().int().min(0).max(2_147_483_647).optional(), // centavos
  maxCost: z.coerce.number().int().min(0).max(2_147_483_647).optional(),
  outdated: z.literal("1").transform(() => true).optional(),
  excludeIgnored: z.literal("1").transform(() => true).optional(),
});

export function queryObject(req: Request) {
  const out: Record<string, string> = {};
  new URL(req.url).searchParams.forEach((v, k) => {
    if (v !== "") out[k] = v;
  });
  return out;
}

export const batchSchema = z.object({
  items: z
    .array(entrySchema.omit({ idempotencyKey: true }))
    .min(1, "Adicione pelo menos uma linha")
    .max(200, "Máximo de 200 linhas por lote"),
  idempotencyKey: z.string().uuid().optional().nullable(),
});
export const bulkDeleteSchema = z.object({ ids: z.array(id).min(1, "Selecione ao menos um lançamento").max(500) });

const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const dayOfMonth = z.number().int().min(1).max(31);
const httpsUrl = z.string().trim().url("Endereço inválido").refine((u) => /^https?:\/\//.test(u), "Use um link http(s)").optional().nullable().or(z.literal(""));

export const supplierSchema = z.object({ name: z.string().trim().min(1, "Informe o nome").max(100), contact: optText(120), notes: optText(500) });
export const supplierAccountSchema = z.object({
  supplierId: id,
  programId: id,
  identifier: optText(80),
  balance: z.number().int().min(0).max(1_000_000_000),
  priceCpmCents: cents,
  cpfAvailable: z.number().int().min(0).max(1000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
  notes: optText(500),
});
export const simulationSchema = z.object({
  kind: z.enum(["bonificada", "store-comparison", "pontos", "transfer", "flight", "hotel", "sale", "supplier-ranking"]),
  title: z.string().trim().min(1).max(120),
  input: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).refine((o) => Object.keys(o).length <= 30, "Simulação grande demais"),
});
export const cardSchema = z.object({
  accountId: id,
  name: z.string().trim().min(1, "Informe o nome do cartão").max(80),
  brand: optText(30),
  pointsPerDollar: z.number().int().min(0).max(100_00),
  dollarRateCents: z.number().int().min(100, "Cotação inválida").max(10_000),
  closingDay: dayOfMonth,
  dueDay: dayOfMonth,
  annualFeeCents: cents.default(0),
  feeWaiverCents: cents.nullable().default(null),
  bank: optText(40),
  brandTier: optText(40),
  last4: z.string().trim().regex(/^\d{4}$/, "Informe só os 4 últimos dígitos").optional().nullable().or(z.literal("").transform(() => null)),
  printedName: optText(60),
  modality: z.enum(["CREDIT", "DEBIT", "MULTIPLE", "PREPAID", "CORPORATE"]).optional().nullable(),
  cardType: z.enum(["HOLDER", "ADDITIONAL"]).optional().nullable(),
  status: z.enum(["ACTIVE", "BLOCKED", "CANCELED", "EXPIRED"]).optional(),
  expMonth: z.number().int().min(1).max(12).optional().nullable(),
  expYear: z.number().int().min(2000).max(2100).optional().nullable(),
  limitCents: cents.optional().nullable(),
  annualFeeMonth: z.number().int().min(1).max(12).optional().nullable(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional().nullable(),
  benefits: z.array(z.string().trim().min(1).max(60)).max(60).optional(),
  benefitsUrl: z.string().trim().url("Link inválido").max(300).optional().nullable().or(z.literal("").transform(() => null)),
  tags: z.array(z.string().trim().min(1).max(30)).max(15).optional(),
  notes: optText(2000),
});
export const cardReminderSchema = z.object({
  kind: z.enum(["DUE", "CLOSING", "ANNUAL_FEE", "EXPIRY", "BENEFIT", "CUSTOM"]),
  title: z.string().trim().min(1, "Dê um título ao lembrete").max(120),
  date: dateStr,
  recurrence: z.enum(["NONE", "MONTHLY", "YEARLY"]).default("NONE"),
  advanceDays: z.number().int().min(0).max(90).default(0),
  whatsapp: z.boolean().default(false),
  note: optText(500),
});
export const cardCommentSchema = z.object({ text: z.string().trim().min(1, "Escreva o comentário").max(2000) });
export const invoiceSchema = z.object({ closingDate: dateStr, dueDate: dateStr, amountCents: cents.refine((v) => v > 0, "Informe o valor da fatura"), pointsIncluded: z.boolean().default(false) });
export const cardBalanceSchema = z.object({ points: z.number().int().min(0).max(100_000_000), date: dateStr });
export const invoiceIncludedSchema = z.object({ pointsIncluded: z.boolean() });
export const guideSchema = z.object({
  slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/, "Use letras minúsculas, números e hífen"),
  kind: z.enum(["VIDEO", "ARTICLE"]),
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(2).max(300),
  body: z.string().max(20_000),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]),
  minutes: z.number().int().min(1).max(240),
  tags: z.array(z.string().trim().min(1).max(30)).max(8),
  videoUrl: httpsUrl,
  order: z.number().int().min(0).max(1000),
  published: z.boolean(),
});
export const newsSchema = z.object({ title: z.string().trim().min(2).max(140), body: z.string().trim().min(2).max(5000), publishedAt: dateStr, published: z.boolean() });

export const recurrenceSchema = z.object({
  accountId: id,
  type: z.enum(MANUAL_CREDIT_TYPES as unknown as [ManualType, ...ManualType[]]),
  description: z.string().trim().min(1, "Informe a descrição").max(120),
  points: z.number().int().positive("Pontos devem ser maiores que zero").max(10_000_000),
  costCents: cents.default(0),
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"]),
  nextDate: dateStr,
  notify: z.boolean().default(true),
  interval: z.number().int().min(1).max(365).default(1),
  dayOfMonth: z.number().int().min(1).max(31).optional().nullable(),
  endDate: dateStr.optional().nullable(),
  skipWeekends: z.boolean().default(false),
});
export const recurrencePatchSchema = z.object({ notify: z.boolean().optional(), active: z.boolean().optional() });
export const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(10).default([]);
export const credentialSchema = z.object({
  login: z.string().min(1, "Informe o login").max(200),
  secret: z.string().min(1, "Informe a senha").max(200),
  notes: z.string().max(500).optional().nullable(),
});
export const revealSchema = z.object({ password: z.string().min(1, "Confirme sua senha").max(128) });

/* ---------------- CRM de pedidos e buscador ---------------- */
const iataCode = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use o código do aeroporto (ex.: GRU)");
const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
export const orderSchema = z.object({
  customerId: z.string().max(40).nullable().optional(),
  customerName: z.string().trim().min(1, "Informe o cliente").max(120),
  customerPhone: z.string().trim().max(30).regex(/^[\d\s()+-]*$/, "Telefone inválido").nullable().optional(),
  customerEmail: z.union([z.string().trim().email("E-mail inválido").max(200), z.literal("")]).nullable().optional(),
  tripType: z.enum(["ONE_WAY", "ROUND_TRIP", "MULTI"]),
  cabin: z.enum(["ECONOMY", "PREMIUM", "BUSINESS", "FIRST"]),
  segments: z.array(z.object({ origin: iataCode, destination: iataCode, date: ymd.nullable() })).min(1).max(6),
  adults: z.number().int().min(1).max(9),
  children: z.number().int().min(0).max(8),
  infants: z.number().int().min(0).max(8),
  flexibleDates: z.boolean().optional(),
  checkedBag: z.boolean().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
  budgetCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  stageId: z.string().max(40).nullable().optional(), // coluna onde o pedido novo entra
});
// "website" é um campo-armadilha: pessoas não veem, robôs preenchem
export const publicOrderSchema = orderSchema.omit({ customerId: true, priority: true, stageId: true }).extend({ website: z.string().max(0).optional() });
export const orderMoveSchema = z.object({ stageId: z.string().min(1).max(40), position: z.number().int().min(0).max(10_000).optional() });
// Funis e colunas do CRM Passagens
const pipelineName = z.string().trim().min(1, "Dê um nome").max(40, "Nome com mais de 40 letras");
const stageColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Cor inválida");
export const pipelineSchema = z.object({ name: pipelineName });
export const stageCreateSchema = z.object({ name: pipelineName, color: stageColor });
export const stageUpdateSchema = z.object({ name: pipelineName.optional(), color: stageColor.optional(), position: z.number().int().min(0).max(100).optional() });

// CRM Milhas
export const dealSchema = z.object({
  buyerType: z.enum(["AGENCY", "BALCAO", "FINAL"]),
  customerId: z.string().max(40).nullable().optional(),
  customerName: z.string().trim().min(1, "Informe o comprador").max(120),
  customerPhone: optText(30),
  accountId: z.string().max(40).nullable().optional(),
  points: z.number().int().min(1).max(100_000_000).nullable().optional(),
  saleCpmCents: z.number().int().min(1).max(1_000_000).nullable().optional(),
  profitCents: z.number().int().min(-100_000_000_00).max(100_000_000_00).nullable().optional(),
  passengers: z.number().int().min(1).max(99).nullable().optional(),
  taxesCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  taxesCardId: z.string().max(40).nullable().optional(), // cartão em que as taxas foram pagas
  orderLink: z.string().trim().url("Link inválido").max(1000).nullable().optional().or(z.literal("")),
  locator: optText(20),
  notes: optText(2000),
});
export const dealMoveSchema = z.object({ stage: z.enum(["NEW", "NEGOTIATION", "AWAITING", "ISSUED", "PAID"]), position: z.number().int().min(0).max(10_000).optional() });
const dealPassengerSchema = z.object({
    name: z.string().trim().min(5, "Informe o nome completo").max(120),
    firstName: z.string().trim().min(2, "Informe o nome").max(60).optional(),
    lastName: z.string().trim().min(2, "Informe o sobrenome").max(60).optional(),
    cpf: z.string().trim().refine((v) => v.replace(/\D/g, "").length === 11, "CPF precisa ter 11 dígitos"),
    birthDate: ymd,
    email: z.string().trim().email("E-mail inválido").max(200).optional().or(z.literal("")),
    phone: z.string().trim().max(30).optional(),
    gender: z.enum(["M", "F"]).optional().or(z.literal("")),
});
export const dealPassengersSchema = z.object({
  passengers: z.array(dealPassengerSchema).min(1).max(9),
  website: z.string().max(0).optional(), // honeypot
});
/** Passageiros informados pelo próprio usuário (o comprador mandou pelo WhatsApp/Telegram); lista vazia limpa. */
export const ownerPassengersSchema = z.object({ passengers: z.array(dealPassengerSchema).max(9) });
export const orderArchiveSchema = z.object({ reason: z.string().trim().min(1).max(120) });
const searchParamsSchema = z.object({ origin: iataCode, destination: iataCode, departDate: ymd, returnDate: ymd.nullable().optional(), adults: z.number().int().min(1).max(9), children: z.number().int().min(0).max(8), infants: z.number().int().min(0).max(8), cabin: z.enum(["ECONOMY", "PREMIUM", "BUSINESS", "FIRST"]) });
export const flightSearchSchema = z.object({ params: searchParamsSchema, programs: z.array(z.string().max(30)).max(40) });
export const quoteSchema = z.object({
  orderId: z.string().max(40).nullable().optional(),
  program: z.string().min(1).max(30),
  origin: iataCode,
  destination: iataCode,
  departDate: ymd,
  returnDate: ymd.nullable().optional(),
  cabin: z.enum(["ECONOMY", "PREMIUM", "BUSINESS", "FIRST"]),
  adults: z.number().int().min(1).max(9),
  miles: z.number().int().min(1).max(10_000_000).nullable().optional(),
  taxesCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  cashCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  costCpmCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
  issueFeeCents: z.number().int().min(0).max(100_000_000).nullable().optional(),
  issueFeeBps: z.number().int().min(0).max(10_000).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export const quoteEditSchema = quoteSchema.pick({ program: true, miles: true, taxesCents: true, cashCents: true, costCpmCents: true, issueFeeCents: true, issueFeeBps: true, notes: true });

// Central de Atendimento: interesse em gestão de milhas ("website" é a armadilha para robôs)
export const publicLeadSchema = z.object({
  name: z.string().trim().min(1, "Informe seu nome").max(120),
  phone: z.string().trim().max(30).regex(/^[\d\s()+-]*$/, "Telefone inválido").nullable().optional(),
  email: z.union([z.string().trim().email("E-mail inválido").max(200), z.literal("")]).nullable().optional(),
  message: z.string().trim().max(1000).nullable().optional(),
  programs: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  incomeRange: z.string().trim().max(60).nullable().optional(),
  website: z.string().max(0).optional(),
});
export const leadStatusSchema = z.object({ status: z.enum(["NEW", "CONTACTED", "CLIENT", "DISCARDED"]) });

export const publicContractSchema = z.object({
  name: z.string().trim().min(5, "Informe seu nome completo").max(120),
  cpf: z.string().trim().refine((v) => v.replace(/\D/g, "").length === 11, "CPF inválido"),
  birthDate: ymd,
  address: z.string().trim().min(8, "Informe seu endereço").max(200),
  accepted: z.literal(true, { errorMap: () => ({ message: "É preciso aceitar os termos" }) }),
  website: z.string().max(0).optional(),
});
export const orderClientInfoSchema = z.object({
  locator: z.string().trim().max(20).regex(/^[A-Za-z0-9]*$/, "Localizador inválido").nullable().optional(),
  clientNotes: z.string().trim().max(1000).nullable().optional(),
  // Formato livre aqui; normalizados por resolveProposal / resolveReservation (domain/proposal.ts)
  proposal: z.record(z.unknown()).refine((d) => JSON.stringify(d).length <= 20_000, "Cotação grande demais").nullable().optional(),
  reservation: z.record(z.unknown()).refine((d) => JSON.stringify(d).length <= 5_000, "Reserva grande demais").nullable().optional(),
});
export const orderAccessSchema = z.object({ digits: z.string().trim().regex(/^\d{4}$/, "Informe os 4 últimos dígitos") });

export const beneficiaryLimitSchema = z.object({ limit: z.number().int().min(1).max(1000).nullable(), window: z.enum(["ROLLING_12M", "CALENDAR_YEAR"]) });
export const beneficiarySchema = z.object({ name: z.string().trim().min(2, "Informe o nome").max(120), document: z.string().trim().max(20).nullable().optional(), usedAt: dateStr });
export const registerPointsSchema = z.object({ points: z.number().int().min(1).max(100_000_000), date: dateStr });
export const partnerSchema = z.object({
  fromProgramId: id,
  toProgramId: id,
  fromUnits: z.number().positive().max(1000),
  toUnits: z.number().positive().max(1000),
  active: z.boolean(),
});
export const clubPlanSchema = z.object({
  programId: id,
  name: z.string().trim().min(2).max(80),
  modality: z.string().trim().max(40),
  miles: z.number().int().min(1).max(10_000_000),
  monthlyCents: z.number().int().min(0).max(100_000_000),
  signupBonus: z.number().int().min(0).max(10_000_000),
  active: z.boolean(),
});

export const saleRefundSchema = z.object({
  feeCents: z.number().int().min(0).max(10_000_000),
  date: dateStr,
});

// Telegram: login da conta do usuário em etapas e o grupo do balcão
export const telegramPhoneSchema = z.object({ phone: z.string().trim().min(8, "Informe o número com DDD").max(30) });
export const telegramCodeSchema = z.object({ code: z.string().trim().min(1, "Informe o código").max(12) });
export const telegramPasswordSchema = z.object({ password: z.string().min(1, "Informe a senha de duas etapas").max(256) });
export const telegramGroupSchema = z.object({ groupId: z.string().trim().regex(/^-?\d{1,20}$/, "Grupo inválido") });
export const telegramSendSchema = z.object({
  text: z.string().trim().min(1, "Escreva a mensagem").max(4096, "Mensagem longa demais (até 4.096 caracteres)"),
  replyTo: z.number().int().positive().optional(), // como resposta a esta mensagem (a contraproposta a um pedido)
});
export const telegramEditSchema = z.object({ text: z.string().trim().min(1, "Escreva a mensagem").max(4096, "Mensagem longa demais (até 4.096 caracteres)") });
export const telegramCrmSchema = z.object({
  messageId: z.number().int().positive(),
  text: z.string().trim().min(1).max(4096),
  sender: z.string().trim().max(200),
  cpmCents: z.number().int().positive().max(1_000_000).nullable().optional(), // o da sua contraproposta
});
export const telegramClearSchema =z.object({ upTo: z.number().int().positive().nullable() }); // null = mostrar tudo de novo
export const telegramDmOpenSchema = z.object({ messageId: z.number().int().positive() });
// contraproposta no privado do autor do pedido: encaminha o pedido e manda a contraproposta como resposta a ele
export const telegramOfferDmSchema = z.object({
  messageId: z.number().int().positive(),
  text: z.string().trim().min(1, "Escreva a contraproposta").max(4096, "Mensagem longa demais (até 4.096 caracteres)"),
  adText: z.string().max(4096).optional(), // o texto do pedido (para a conversa mostrar mesmo se o grupo não deixa encaminhar)
});
export const telegramSeenSchema = z.object({ upTo: z.number().int().positive() });
const optInt = (min: number, max: number, msg: string) => z.number({ invalid_type_error: msg }).int(msg).min(min, msg).max(max, msg).nullable().optional();
export const telegramAlertSchema = z
  .object({
    name: z.string().trim().max(80).optional(),
    words: z.array(z.string().trim().max(40, "Palavra longa demais")).max(10, "Até 10 palavras por alerta").default([]),
    program: z.enum(BALCAO_PROGRAMS).nullable().optional(),
    maxCpfs: optInt(1, 99, "CPFs: de 1 a 99"),
    minMiles: optInt(0, 100_000_000, "Milhas inválidas"),
    maxMiles: optInt(1, 100_000_000, "Milhas inválidas"),
    minCpmCents: optInt(1, 1_000_000, "Milheiro inválido"),
    minProfitCents: optInt(1, 100_000_000, "Lucro inválido"),
    minProfitPerCpfCents: optInt(1, 100_000_000, "Lucro por CPF inválido"),
    active: z.boolean().optional(),
  })
  .refine((a) => a.minMiles == null || a.maxMiles == null || a.minMiles <= a.maxMiles, { message: "As milhas mínimas passam das máximas", path: ["minMiles"] });

export const salePaymentSchema = z.object({
  paid: z.boolean(),
  date: dateStr.optional(),
  accountId: id.nullable().optional(), // conta do Financeiro em que o dinheiro entrou (null = fora das contas)
});
export const saleTagsSchema = z.object({
  tags: z.array(z.string().trim().min(1, "Etiqueta vazia").max(30, "Etiqueta com mais de 30 letras")).max(10, "No máximo 10 etiquetas"),
});
export const saleRefundReceiptSchema = z.object({
  kind: z.enum(["miles", "tax"]),
  date: dateStr,
});

// ViajeFácil (Smiles): reserva com prazo para quitar em milhas
export const viajeFacilSchema = z.object({
  customerName: z.string().trim().min(1, "Informe o cliente").max(120),
  deadline: dateStr,
  miles: z.number().int().positive("Informe as milhas").max(10_000_000),
  roundTrip: z.boolean().optional(),
  origin: z.string().trim().max(3).regex(/^[A-Za-z]{0,3}$/, "Use o código do aeroporto (ex.: GRU)").nullable().optional(),
  destination: z.string().trim().max(3).regex(/^[A-Za-z]{0,3}$/, "Use o código do aeroporto (ex.: GRU)").nullable().optional(),
  cabin: z.enum(["ECONOMY", "PREMIUM", "BUSINESS", "FIRST"]).nullable().optional(),
  passengers: z.array(z.string().trim().min(1).max(120)).max(9, "No máximo 9 passageiros").optional(),
  milesInAccount: z.boolean().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
export const viajeFacilPaidSchema = z.object({ paid: z.boolean() });

// Financeiro
export const finAccountSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para a conta").max(60),
  kind: z.enum(["BANK", "CASH", "WALLET", "OTHER"]),
  initialCents: z.number().int().min(-100_000_000_00).max(100_000_000_00),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida").optional(),
});
export const finTxSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]),
  accountId: id,
  toAccountId: id.nullable().optional(),
  category: z.string().trim().max(80).nullable().optional(),
  amountCents: z.number().int().positive("Informe o valor").max(100_000_000_00),
  description: z.string().trim().max(200).nullable().optional(),
  counterpart: z.string().trim().max(120).nullable().optional(),
  competence: dateStr,
  dueDate: dateStr,
  paid: z.boolean(),
  repeatMonths: z.number().int().min(1).max(36).optional(),
  cardId: id.nullable().optional(), // despesa no cartão: vai para a fatura
});
/** Vencimento calculado da fatura (AAAA-MM-DD): a chave dela, junto com o cartão. */
const billDue = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const payCents = z.number({ invalid_type_error: "Informe o valor pago" }).int().positive("Informe o valor pago").max(100_000_000_00);
/** Marca faturas do cartão (pelo vencimento) como pagas ou volta a em aberto. */
export const cardBillsPaySchema = z.object({ cardId: id, dueDates: z.array(billDue).min(1).max(60), paid: z.boolean(), date: dateStr.optional(), accountId: id.nullable().optional() });
/** Valor real e vencimento de uma fatura (null = o calculado). */
export const cardBillEditSchema = z.object({ cardId: id, dueDate: billDue, realCents: cents.nullable(), dueOverride: dateStr.nullable() });
/** Pagamento (inteiro ou parte) de uma fatura. */
export const billPaymentSchema = z.object({ cardId: id, dueDate: billDue, paidAt: dateStr, amountCents: payCents, accountId: id.nullable().optional() });
export const billPaymentUpdateSchema = z.object({ paidAt: dateStr, amountCents: payCents, accountId: id.nullable().optional() });
/** Editar uma compra a partir da fatura: valor, data e cartão (null tira do cartão). */
/** Adicionar uma compra na fatura (despesa do Financeiro no cartão); addToReal soma ao valor real, se houver. */
export const billItemAddSchema = z.object({ cardId: id, dueDate: billDue, amountCents: z.number({ invalid_type_error: "Informe o valor" }).int().positive("Informe o valor").max(100_000_000_00), day: dateStr, description: z.string().trim().max(200).nullable().optional(), category: z.string().trim().max(120).nullable().optional(), accountId: id, addToReal: z.boolean().default(true) });
export const billItemEditSchema = z.object({ kind: z.enum(["fin", "entry"]), id, cardId: id, amountCents: payCents.optional(), day: dateStr.optional(), newCardId: id.nullable() });
export const finPaidSchema = z.object({ paid: z.boolean(), date: dateStr.optional() });
export const saleInvoiceSchema = z.object({ number: z.string().trim().max(40).nullable(), date: dateStr.optional() });

// Equipe, tarefas, metas e processos
const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida");
const priority = z.enum(["LOW", "MEDIUM", "HIGH"]);
export const memberSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  role: z.string().trim().max(80).nullable().optional(),
  email: z.union([z.string().trim().email("E-mail inválido").max(200), z.literal("")]).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  color: hexColor.optional(),
  active: z.boolean().optional(),
  issuer: z.boolean().optional(),
});
export const taskSchema = z.object({
  boardId: id.nullable().optional(),
  title: z.string().trim().min(1, "Informe a tarefa").max(200),
  description: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]),
  memberIds: z.array(id).max(20).optional(),
  dueDate: dateStr.nullable().optional(),
  dueTime: z.string().trim().max(5).nullable().optional(),
  status: z.enum(["TODO", "DOING", "DONE"]).optional(),
  columnId: z.string().trim().max(40).nullable().optional(),
  recurrence: z.enum(["NONE", "DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "SEMIANNUAL", "YEARLY"]).optional(),
  checklist: z.array(z.object({ text: z.string().trim().max(200), done: z.boolean() })).max(50).optional(),
});
export const boardSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome ao quadro").max(40),
  description: z.string().trim().max(500).nullable().optional(),
  columns: z.array(z.object({ id: z.string().trim().max(40).optional(), name: z.string().trim().min(1, "Dê um nome à coluna").max(30) })).max(12, "No máximo 12 colunas").optional(),
  restricted: z.boolean().optional(),
  memberIds: z.array(id).max(50).optional(),
});
export const taskAssignSchema = z.object({ memberId: id.nullable() });
export const checklistToggleSchema = z.object({ index: z.number().int().min(0).max(49), done: z.boolean() });
export const taskCommentSchema = z.object({ text: z.string().trim().min(1, "Escreva o comentário").max(2000) });
export const salesPartnerSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  mode: z.enum(["PROFIT_PCT", "SALE_PCT", "FIXED"]),
  value: z.number().int().min(0).max(100_000_00),
  notes: z.string().trim().max(1000).nullable().optional(),
  active: z.boolean().optional(),
});
export const salePartnerSchema = z.object({ partnerId: id.nullable() });
export const saleIssuersSchema = z.object({ memberIds: z.array(id).max(10) });
export const metricsHiddenSchema = z.object({ hidden: z.array(z.string().max(40)).max(40) });
export const taskMoveSchema = z.union([
  z.object({ status: z.enum(["TODO", "DOING", "DONE"]), position: z.number().int().min(0).max(10_000).optional() }),
  z.object({ columnId: z.string().trim().min(1).max(40), position: z.number().int().min(0).max(10_000).optional() }),
]);
export const goalSchema = z.object({
  title: z.string().trim().min(1, "Informe o objetivo").max(200),
  period: z.enum(["MONTH", "QUARTER", "YEAR"]),
  start: dateStr,
  memberId: id.nullable().optional(),
  keyResults: z.array(z.object({
    title: z.string().trim().min(1, "Dê um nome ao resultado-chave").max(200),
    metric: z.enum(["MANUAL", "REVENUE", "PROFIT", "SALES", "MILES", "CUSTOMERS"]),
    target: z.number().int().positive("A meta precisa ser maior que zero").max(10_000_000_000),
    current: z.number().int().min(0).max(10_000_000_000).optional(),
  })).min(1, "Inclua ao menos um resultado-chave").max(10),
});
export const checkInSchema = z.object({ current: z.number().int().min(0).max(10_000_000_000) });
// Metas e comissões. % em centésimos (10% = 1000); R$ em centavos; faixas no medidor da regra.
export const commissionRuleSchema = z.object({
  memberId: id,
  kind: z.enum(["SALE_PCT", "PROFIT_PCT", "FIXED", "PER_K_MILES"]),
  value: z.number().int().min(0).max(100_000_000),
  base: z.enum(["INDIVIDUAL", "TEAM"]).default("INDIVIDUAL"),
  tiers: z.array(z.object({ min: z.number().min(0).max(100_000_000_000), value: z.number().int().min(0).max(100_000_000) })).max(10).default([]),
  period: z.enum(["MONTH", "QUARTER"]).default("MONTH"),
  startsAt: dateStr,
  active: z.boolean().optional(),
});
const commissionOwner = z.object({ memberId: id.optional(), partnerId: id.optional() })
  .refine((o) => !!o.memberId !== !!o.partnerId, "Escolha um membro ou um parceiro");
export const commissionEntrySchema = z.object({
  memberId: id.optional(), partnerId: id.optional(),
  kind: z.enum(["BONUS", "ADJUST"]),
  amountCents: z.number().int().min(-100_000_000_00).max(100_000_000_00),
  date: dateStr,
  note: z.string().trim().max(300).optional().nullable(),
}).and(commissionOwner);
export const commissionPaySchema = z.object({
  memberId: id.optional(), partnerId: id.optional(),
  amountCents: cents.refine((v) => v > 0, "Informe o valor pago"),
  date: dateStr,
  finAccountId: id.optional().nullable(),
  note: z.string().trim().max(300).optional().nullable(),
}).and(commissionOwner);
export const processSchema = z.object({
  title: z.string().trim().min(1, "Dê um nome ao processo").max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  steps: z.array(z.object({ title: z.string().trim().max(200), detail: z.string().trim().max(1000).nullable().optional() })).min(1).max(50),
});
export const processRunSchema = z.object({ label: z.string().trim().max(80).nullable().optional(), memberId: id.nullable().optional(), dueDate: dateStr.nullable().optional() });

// Contatos: passageiros e interesses de viagem
export const passengerSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120),
  cpf: z.string().trim().max(20).nullable().optional(),
  birthDate: dateStr.nullable().optional(),
  email: z.union([z.string().trim().email("E-mail inválido").max(200), z.literal("")]).nullable().optional(),
  phone: z.string().trim().max(30).nullable().optional(),
  customerId: id.nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
});
const interestStatus = z.enum(["NEW", "SEARCHING", "OFFER_SENT", "BOOKED", "LOST"]);
export const interestSchema = z.object({
  customerId: id.nullable().optional(),
  customerName: z.string().trim().max(120).default(""),
  origin: z.string().trim().max(3).nullable().optional(),
  destination: z.string().trim().min(1, "Informe o destino").max(80),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Mês inválido").nullable().optional(),
  priority,
  status: interestStatus,
  programs: z.array(z.string().trim().min(1).max(40)).max(10).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
}).refine((v) => !!v.customerId || v.customerName.length > 0, { message: "Informe o cliente", path: ["customerName"] });
export const interestStatusSchema = z.object({ status: interestStatus });

export const showcaseSchema = z.object({
  title: z.string().trim().min(1, "Dê um título ao pacote").max(120),
  destination: z.string().trim().min(1, "Informe o destino").max(80),
  period: optText(80),
  includes: z.array(z.string().trim().max(60)).max(12).optional(), // vazios e repetidos saem no serviço (até 8)
  description: optText(1000),
  priceCents: cents.nullable().optional(),
  priceNote: optText(60),
  installments: optText(60),
  active: z.boolean().optional(),
  orderId: id.nullable().optional(),
});
export const showcaseSettingsSchema = z.object({ active: z.boolean(), title: optText(80) });
export const showcaseMoveSchema = z.object({ dir: z.union([z.literal(-1), z.literal(1)]) });

export const siteSaveSchema = z.object({
  slug: z.string().trim().toLowerCase().min(3, "Mínimo de 3 caracteres").max(40).regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "Use letras minúsculas, números e hífen").nullable().optional(),
  theme: z.string().trim().max(30),
  published: z.boolean(),
  content: z.unknown(), // normalizado no serviço (domain/site.ts)
});
