-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "nfIssuedAt" TIMESTAMP(3),
ADD COLUMN     "nfNumber" TEXT;

-- CreateTable
CREATE TABLE "FinAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'BANK',
    "initialCents" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT NOT NULL DEFAULT '#60a5fa',
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "toAccountId" TEXT,
    "category" TEXT,
    "amountCents" INTEGER NOT NULL,
    "description" TEXT,
    "counterpart" TEXT,
    "competence" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "repeatGroup" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FinAccount_userId_idx" ON "FinAccount"("userId");

-- CreateIndex
CREATE INDEX "FinTransaction_userId_dueDate_idx" ON "FinTransaction"("userId", "dueDate");

-- CreateIndex
CREATE INDEX "FinTransaction_userId_competence_idx" ON "FinTransaction"("userId", "competence");

-- AddForeignKey
ALTER TABLE "FinAccount" ADD CONSTRAINT "FinAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "FinAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinTransaction" ADD CONSTRAINT "FinTransaction_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "FinAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

