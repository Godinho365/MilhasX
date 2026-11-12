-- Metas e comissões: regras de comissão por membro da equipe e o extrato (bônus, ajustes e pagamentos) de
-- membros e parceiros. A comissão de cada período é calculada das vendas. Só acrescenta.

-- CreateTable
CREATE TABLE "CommissionRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "base" TEXT NOT NULL DEFAULT 'INDIVIDUAL',
    "tiers" JSONB NOT NULL DEFAULT '[]',
    "period" TEXT NOT NULL DEFAULT 'MONTH',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommissionEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "memberId" TEXT,
    "partnerId" TEXT,
    "kind" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "finTransactionId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CommissionRule_userId_idx" ON "CommissionRule"("userId");

-- CreateIndex
CREATE INDEX "CommissionEntry_userId_date_idx" ON "CommissionEntry"("userId", "date");

-- CreateIndex
CREATE INDEX "CommissionEntry_memberId_idx" ON "CommissionEntry"("memberId");

-- CreateIndex
CREATE INDEX "CommissionEntry_partnerId_idx" ON "CommissionEntry"("partnerId");

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionRule" ADD CONSTRAINT "CommissionRule_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "TeamMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Cada lançamento do extrato é de um membro ou de um parceiro (exatamente um)
ALTER TABLE "CommissionEntry" ADD CONSTRAINT "CommissionEntry_one_owner_check" CHECK (("memberId" IS NULL) <> ("partnerId" IS NULL));
