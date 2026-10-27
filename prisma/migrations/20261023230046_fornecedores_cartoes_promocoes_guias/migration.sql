-- CreateEnum
CREATE TYPE "PromotionKind" AS ENUM ('TRANSFER_BONUS', 'PURCHASE_BONUS', 'CLUB', 'SHOPPING', 'OTHER');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "GuideKind" AS ENUM ('VIDEO', 'ARTICLE');

-- CreateEnum
CREATE TYPE "GuideLevel" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED');

-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'PROMOTION';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatar" BYTEA,
ADD COLUMN     "avatarMime" TEXT,
ADD COLUMN     "avatarUpdatedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "dashboardView" TEXT NOT NULL DEFAULT 'gestao',
ADD COLUMN     "newsReadAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupplierAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "identifier" TEXT,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "priceCpmCents" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupplierAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT,
    "pointsPerDollar" INTEGER NOT NULL,
    "dollarRateCents" INTEGER NOT NULL DEFAULT 550,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "annualFeeCents" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardInvoice" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "closingDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "expectedPoints" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'OPEN',
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "kind" "PromotionKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "fromProgramId" TEXT,
    "toProgramId" TEXT,
    "bonusPercent" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guide" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "kind" "GuideKind" NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "level" "GuideLevel" NOT NULL DEFAULT 'BEGINNER',
    "minutes" INTEGER NOT NULL DEFAULT 5,
    "tags" TEXT[],
    "videoUrl" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guide_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NewsPost" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "NewsPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Supplier_userId_idx" ON "Supplier"("userId");

-- CreateIndex
CREATE INDEX "SupplierAccount_userId_idx" ON "SupplierAccount"("userId");

-- CreateIndex
CREATE INDEX "CreditCard_userId_idx" ON "CreditCard"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInvoice_entryId_key" ON "CardInvoice"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "CardInvoice_cardId_dueDate_key" ON "CardInvoice"("cardId", "dueDate");

-- CreateIndex
CREATE INDEX "Promotion_endsAt_idx" ON "Promotion"("endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "Guide_slug_key" ON "Guide"("slug");

-- CreateIndex
CREATE INDEX "NewsPost_publishedAt_idx" ON "NewsPost"("publishedAt");

-- AddForeignKey
ALTER TABLE "Supplier" ADD CONSTRAINT "Supplier_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierAccount" ADD CONSTRAINT "SupplierAccount_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCard" ADD CONSTRAINT "CreditCard_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoice" ADD CONSTRAINT "CardInvoice_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "CreditCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CardInvoice" ADD CONSTRAINT "CardInvoice_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_fromProgramId_fkey" FOREIGN KEY ("fromProgramId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_toProgramId_fkey" FOREIGN KEY ("toProgramId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;
