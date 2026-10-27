-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "RecurrenceFrequency" ADD VALUE 'DAILY';
ALTER TYPE "RecurrenceFrequency" ADD VALUE 'WEEKLY';

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "details" JSONB,
ADD COLUMN     "priorityCostCents" INTEGER,
ADD COLUMN     "priorityPoints" INTEGER,
ADD COLUMN     "storeId" TEXT;

-- AlterTable
ALTER TABLE "Recurrence" ADD COLUMN     "dayOfMonth" INTEGER,
ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "interval" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "skipWeekends" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "EntryCost" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "cardId" TEXT,

    CONSTRAINT "EntryCost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryCost_entryId_idx" ON "EntryCost"("entryId");

-- AddForeignKey
ALTER TABLE "EntryCost" ADD CONSTRAINT "EntryCost_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryCost" ADD CONSTRAINT "EntryCost_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE SET NULL ON UPDATE CASCADE;
