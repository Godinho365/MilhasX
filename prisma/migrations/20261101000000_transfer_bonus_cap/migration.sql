-- Limite mensal do bônus de transferência e aviso único por chave
-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "transferBonusCap" INTEGER;

-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Notification_userId_key_key" ON "Notification"("userId", "key");


-- Clube LATAM Pass: o bônus em transferências vai até 30 mil milhas por mês nas contas que já têm bônus
UPDATE "Account" a SET "transferBonusCap" = 30000
FROM "Program" p WHERE p."id" = a."programId" AND p."name" ILIKE '%latam%' AND a."transferBonusPct" IS NOT NULL;
