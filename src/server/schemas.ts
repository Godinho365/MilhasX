import { z } from "zod";
import { MANUAL_CREDIT_TYPES, MANUAL_DEBIT_TYPES, CREDIT_TYPES, DEBIT_TYPES, type EntryType } from "@/domain/ledger";

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
  attributes: z.array(z.object({ key: z.string().trim().min(1, "Informe o nome do atributo").max(40), value: z.string().trim().max(200) })).max(20).optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
  active: z.boolean().optional(),
});
export const accountSchema = z.object({ holderId: id, programId: id });
export const accountPatchSchema = z.object({
  nickname: z.string().trim().max(60).optional().nullable(),
  pinned: z.boolean().optional(),
  archived: z.boolean().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  cpfAvailable: z.number().int().min(0).max(1000).optional().nullable(),
});

const COST_ENUM = ["PONTOS", "IOF", "OUTROS", "FRETE", "MARKUP", "MENSALIDADE", "ANUIDADE", "TAXA_EMBARQUE", "COMPLETAR_PONTOS"] as const;
export const costItemSchema = z.object({ type: z.enum(COST_ENUM), amountCents: z.number().int().min(0).max(100_000_000_00), cardId: id.optional().nullable() });
const optDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal(""));
export const detailsSchema = z
  .object({
    cashReferenceCents: z.number().int().min(0).max(100_000_000_00).optional().nullable(),
    passengers: z.number().int().min(1).max(99).optional().nullable(),
    reservation: z.string().trim().max(40).optional().nullable(),
    origin: z.string().trim().regex(/^[A-Z]{3}$/, "Aeroporto inválido").optional().nullable().or(z.literal("")),
    destination: z.string().trim().regex(/^[A-Z]{3}$/, "Aeroporto inválido").optional().nullable().or(z.literal("")),
    startDate: optDate,
    endDate: optDate,
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
  storeId: id.optional().nullable(),
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
  purchase: z.object({ points: points, priceCents: cents, applyAll: z.boolean().default(false) }).optional().nullable(),
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
  type: z.enum(["STORE_POINTS", "MIN_BALANCE", "PROMOTION"]),
  storeId: id.optional(),
  programId: id.optional(),
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
  notifications: z.record(z.enum(["points", "offers", "entries", "marketing", "system", "billing"]), channel).optional(),
});
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
export const offerSchema = z.object({
  storeName: z.string().trim().min(1).max(100),
  programId: id.optional().nullable(),
  pointsPerReal: z.number().int().min(0).max(100_00),
  cashbackBps: z.number().int().min(0).max(100_00),
  portal: z.string().trim().max(60).optional().nullable(),
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
});
export const invoiceSchema = z.object({ closingDate: dateStr, dueDate: dateStr, amountCents: cents.refine((v) => v > 0, "Informe o valor da fatura"), pointsIncluded: z.boolean().default(false) });
export const cardBalanceSchema = z.object({ points: z.number().int().min(0).max(100_000_000), date: dateStr });
export const invoiceIncludedSchema = z.object({ pointsIncluded: z.boolean() });
export const promotionSchema = z.object({
  kind: z.enum(["TRANSFER_BONUS", "PURCHASE_BONUS", "CLUB", "SHOPPING", "OTHER"]),
  title: z.string().trim().min(3).max(140),
  description: optText(1000),
  fromProgramId: id.optional().nullable(),
  toProgramId: id.optional().nullable(),
  bonusPercent: z.number().int().min(0).max(300),
  url: httpsUrl,
  startsAt: dateStr,
  endsAt: dateStr,
  active: z.boolean(),
});
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
export const purchaseSchema = z.object({
  accountId: id,
  storeId: id.optional().nullable(),
  storeName: z.string().trim().max(100).default(""),
  description: z.string().trim().max(200).optional().nullable(),
  purchasedAt: dateStr,
  amountCents: cents.refine((v) => v > 0, "Informe o valor dos produtos"),
  extraCostCents: cents.default(0),
  costs: z.array(z.object({ type: z.enum(["DIFERENCA_PRECO", "FRETE", "TAXAS", "OUTROS"]), amountCents: cents })).max(20).optional(),
  pointsPerReal: z.number().int().min(1, "Informe os pontos por real").max(100_00),
  expectedAt: dateStr.optional().nullable(),
  expectedDeliveryAt: dateStr.optional().nullable(),
  tags: tagsSchema,
  notes: z.string().trim().max(1000).optional().nullable(),
});
export const purchaseStageSchema = z.object({ stage: z.enum(["PENDING", "DELIVERED"]), date: dateStr.optional() });
export const receivePurchaseSchema = z.object({ points: z.number().int().positive().max(100_000_000).optional(), receivedAt: dateStr });
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
});
// "website" é um campo-armadilha: pessoas não veem, robôs preenchem
export const publicOrderSchema = orderSchema.omit({ customerId: true, priority: true }).extend({ website: z.string().max(0).optional() });
export const orderMoveSchema = z.object({ stage: z.enum(["NEW", "QUOTING", "QUOTE_SENT", "NEGOTIATION", "ISSUED", "TRAVELING", "DONE"]), position: z.number().int().min(0).max(10_000).optional() });
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
  notes: z.string().max(500).nullable().optional(),
});

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
