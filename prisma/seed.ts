// Dados de demonstração SINTÉTICOS. Nada aqui vem de clientes reais.
// Uso: npm run db:seed  (idempotente para programas/lojas; recria a conta demo)
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");

async function main() {
  const { prisma } = await import("../src/server/db");
  const { hashPassword } = await import("../src/server/auth");
  const { createEntry, createTransfer } = await import("../src/server/services/ledger");
  const { createSale } = await import("../src/server/services/sales");
  const { createSupplier, upsertSupplierAccount, createCard, addInvoice } = await import("../src/server/services/extras");
  const { seedContent } = await import("./content");
  const { importProgramLogos } = await import("./program-logos");

  const programs = [
    { code: "LIVELO", name: "Livelo", kind: "POINTS", mv: 2800, color: "#ec4899" },
    { code: "ESFERA", name: "Esfera", kind: "POINTS", mv: 2600, color: "#ef4444" },
    { code: "LATAM", name: "LATAM Pass", kind: "MILES", mv: 2450, color: "#818cf8" },
    { code: "SMILES", name: "Smiles", kind: "MILES", mv: 1750, color: "#f97316" },
    { code: "AZUL", name: "Azul Fidelidade", kind: "MILES", mv: 1900, color: "#38bdf8" },
    { code: "NUBANK", name: "Nubank Ultravioleta", kind: "POINTS", mv: 0, color: "#820ad1" },
  ] as const;
  const prog: Record<string, string> = {};
  for (const p of programs) {
    const row = await prisma.program.upsert({ where: { code: p.code }, update: { color: p.color }, create: { code: p.code, name: p.name, kind: p.kind, marketValueCpmCents: p.mv, color: p.color } });
    prog[p.code] = row.id;
  }
  // Ícones dos programas (só onde o admin ainda não enviou um)
  await importProgramLogos(prisma);

  // Lojas fictícias (nomes genéricos) com ofertas de exemplo
  const stores: [string, string | null, number, string | null, number][] = [
    ["Loja Exemplo Eletrônicos", "LIVELO", 300, "Portal Cashback A", 250],
    ["Mercado Demo", "ESFERA", 200, null, 0],
    ["Moda Fictícia", "LIVELO", 800, "Portal Cashback B", 600],
    ["Farmácia Teste", "SMILES", 150, "Portal Cashback A", 400],
    ["Viagens Simuladas", "AZUL", 500, null, 0],
    ["Esportes Demo", "LATAM", 400, "Portal Cashback C", 300],
  ];
  for (const [name, code, ppr, portal, cash] of stores) {
    const s = await prisma.store.upsert({ where: { name }, update: {}, create: { name } });
    if (!(await prisma.storeOffer.count({ where: { storeId: s.id } }))) {
      if (code) await prisma.storeOffer.create({ data: { storeId: s.id, programId: prog[code]!, pointsPerReal: ppr } });
      if (portal) await prisma.storeOffer.create({ data: { storeId: s.id, portal, cashbackBps: cash } });
    }
  }

  // Conta demo (senha só para ambiente local; troque ou apague em produção)
  const email = "demo@milheiro.local";
  await prisma.user.deleteMany({ where: { email } });
  const user = await prisma.user.create({
    data: { email, name: "Usuário Demo", plan: "GESTOR", passwordHash: await hashPassword(process.env.DEMO_PASSWORD || "demo12345"), preference: { create: {} } },
  });
  const h1 = await prisma.holder.create({ data: { userId: user.id, name: "Titular Um", isSelf: true } });
  const h2 = await prisma.holder.create({ data: { userId: user.id, name: "Titular Dois" } });
  const acc = async (holderId: string, code: string) => (await prisma.account.create({ data: { userId: user.id, holderId, programId: prog[code]! } })).id;
  const l1 = await acc(h1.id, "LIVELO"), t1 = await acc(h1.id, "LATAM"), s1 = await acc(h1.id, "SMILES");
  const l2 = await acc(h2.id, "LIVELO"), t2 = await acc(h2.id, "LATAM");
  const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

  await createEntry(user.id, { accountId: t1, type: "INITIAL_BALANCE", points: 8000, occurredAt: d("2026-07-01") });
  await createEntry(user.id, { accountId: l1, type: "CLUB", points: 2000, costCents: 4990, occurredAt: d("2026-08-01") });
  await createEntry(user.id, { accountId: l1, type: "CARD", points: 3500, occurredAt: d("2026-08-10") });
  await createEntry(user.id, { accountId: l1, type: "PURCHASE", points: 45000, costCents: 139050, occurredAt: d("2026-09-05") });
  await createTransfer(user.id, { fromAccountId: l1, toAccountId: t1, points: 50000, bonusPercent: 25, occurredAt: d("2026-09-06") });
  await createEntry(user.id, { accountId: l2, type: "CLUB", points: 2000, costCents: 4990, occurredAt: d("2026-09-01") });
  await createEntry(user.id, { accountId: l2, type: "PURCHASE", points: 18000, costCents: 55800, occurredAt: d("2026-09-15") });
  await createTransfer(user.id, { fromAccountId: l2, toAccountId: t2, points: 20000, bonusPercent: 25, occurredAt: d("2026-09-16") });
  await createEntry(user.id, { accountId: s1, type: "CARD", points: 12000, occurredAt: d("2026-10-01") });
  await createEntry(user.id, { accountId: l1, type: "PURCHASE", points: 10000, costCents: 30000, occurredAt: d("2026-10-30"), status: "PENDING" });
  // Dados sintéticos: cliente e uma venda de emissão (passagem GRU → LIS)
  const customer = await prisma.customer.create({ data: { userId: user.id, name: "Cliente Exemplo", kind: "FINAL", docType: "CPF", docNumber: "000.000.000-00", email: "cliente@exemplo.test" } });
  await createSale(user.id, {
    origin: "OWN",
    accountId: t1,
    occurredAt: d("2026-10-10"),
    items: [{ kind: "FLIGHT", issuedWith: "POINTS", points: 20000, salePriceCents: 52500, costs: [{ type: "TAXA_EMBARQUE", amountCents: 30000 }], clientType: "FINAL", customerIds: [customer.id], passengers: 1, reservation: "ABC123", origin: "GRU", destination: "LIS" }],
  });
  await prisma.alert.create({ data: { userId: user.id, type: "MIN_BALANCE", accountId: t2, threshold: 30000 } });

  const sup = await createSupplier(user.id, { name: "Fornecedor Exemplo", contact: "fornecedor@exemplo.test" });
  await upsertSupplierAccount(user.id, null, { supplierId: sup.id, programId: prog.LATAM!, identifier: "LA-000123", balance: 80000, priceCpmCents: 1900 });
  const card = await createCard(user.id, { accountId: l1, name: "Cartão Exemplo Black", brand: "Mastercard", pointsPerDollar: 220, dollarRateCents: 550, closingDay: 3, dueDay: 10, annualFeeCents: 0 });
  await addInvoice(user.id, card.id, { closingDate: d("2026-10-03"), dueDate: d("2026-10-10"), amountCents: 450000 });

  const { upsertRecurrence, createPurchase } = await import("../src/server/services/accounts");
  const nextMonth = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1, 21));
  await upsertRecurrence(user.id, null, { accountId: l1, type: "CLUB", description: "Pontos de clube", points: 2000, costCents: 4990, frequency: "MONTHLY", nextDate: nextMonth, notify: true });
  const store = await prisma.store.findUnique({ where: { name: "Moda Fictícia" } });
  await createPurchase(user.id, { accountId: l1, storeId: store?.id ?? null, storeName: "Moda Fictícia", purchasedAt: d("2026-10-15"), amountCents: 50000, extraCostCents: 0, pointsPerReal: 800, expectedAt: d("2026-11-15") });

  await seedContent(prisma);

  console.log(`Seed concluído. Conta demo: ${email} (senha: DEMO_PASSWORD ou o padrão local do README)`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
