-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "BonusPurchaseStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELED');

-- CreateTable
CREATE TABLE "Recurrence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "EntryType" NOT NULL DEFAULT 'CLUB',
    "description" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "frequency" "RecurrenceFrequency" NOT NULL DEFAULT 'MONTHLY',
    "nextDate" TIMESTAMP(3) NOT NULL,
    "notify" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Recurrence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BonusPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "storeId" TEXT,
    "storeName" TEXT NOT NULL,
    "purchasedAt" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "extraCostCents" INTEGER NOT NULL DEFAULT 0,
    "pointsPerReal" INTEGER NOT NULL,
    "expectedPoints" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3),
    "status" "BonusPurchaseStatus" NOT NULL DEFAULT 'PENDING',
    "entryId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCredential" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "loginEnc" TEXT NOT NULL,
    "secretEnc" TEXT NOT NULL,
    "notesEnc" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Recurrence_userId_nextDate_idx" ON "Recurrence"("userId", "nextDate");

-- CreateIndex
CREATE UNIQUE INDEX "BonusPurchase_entryId_key" ON "BonusPurchase"("entryId");

-- CreateIndex
CREATE INDEX "BonusPurchase_userId_status_idx" ON "BonusPurchase"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCredential_accountId_key" ON "AccountCredential"("accountId");

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recurrence" ADD CONSTRAINT "Recurrence_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPurchase" ADD CONSTRAINT "BonusPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPurchase" ADD CONSTRAINT "BonusPurchase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPurchase" ADD CONSTRAINT "BonusPurchase_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BonusPurchase" ADD CONSTRAINT "BonusPurchase_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountCredential" ADD CONSTRAINT "AccountCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
