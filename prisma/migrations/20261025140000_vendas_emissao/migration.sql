-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "docNumber" TEXT,
ADD COLUMN     "docType" TEXT,
ADD COLUMN     "documents" JSONB,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'FINAL',
ADD COLUMN     "phone" TEXT;

-- CreateTable
CREATE TABLE "SaleItem" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "issuedWith" TEXT NOT NULL DEFAULT 'POINTS',
    "points" INTEGER NOT NULL DEFAULT 0,
    "salePriceCents" INTEGER NOT NULL,
    "cashCostCents" INTEGER NOT NULL DEFAULT 0,
    "supplierCpmCents" INTEGER,
    "costs" JSONB,
    "clientType" TEXT NOT NULL DEFAULT 'FINAL',
    "passengers" INTEGER,
    "reservation" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "departureDate" TIMESTAMP(3),
    "returnDate" TIMESTAMP(3),
    "description" TEXT,
    "observation" TEXT,
    "entryId" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SaleItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleAttachment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_SaleItemCustomers" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_SaleItemCustomers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "SaleItem_entryId_key" ON "SaleItem"("entryId");

-- CreateIndex
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");

-- CreateIndex
CREATE INDEX "SaleAttachment_saleId_idx" ON "SaleAttachment"("saleId");

-- CreateIndex
CREATE INDEX "_SaleItemCustomers_B_index" ON "_SaleItemCustomers"("B");

-- Novas colunas da venda (antes de converter os dados)
ALTER TABLE "Sale" ADD COLUMN "groupId" TEXT,
ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'OWN',
ADD COLUMN "supplierAccountId" TEXT,
ALTER COLUMN "accountId" DROP NOT NULL;

-- Conversão: cada venda antiga vira um item "Outro" com o mesmo lançamento e o valor líquido recebido
UPDATE "Sale" s SET "groupId" = e."groupId" FROM "Entry" e WHERE e."id" = s."entryId";
INSERT INTO "SaleItem" ("id", "saleId", "kind", "issuedWith", "points", "salePriceCents", "entryId", "description")
SELECT 'si_' || s."id", s."id", 'OTHER', 'POINTS', s."points", s."totalCents", s."entryId", 'Venda de pontos' FROM "Sale" s;
INSERT INTO "_SaleItemCustomers" ("A", "B") SELECT s."customerId", 'si_' || s."id" FROM "Sale" s WHERE s."customerId" IS NOT NULL;

-- Remove o vínculo antigo venda → lançamento e os campos de preço
ALTER TABLE "Sale" DROP CONSTRAINT "Sale_entryId_fkey";
DROP INDEX "Sale_entryId_key";
ALTER TABLE "Sale" DROP COLUMN "entryId", DROP COLUMN "feesCents", DROP COLUMN "priceCpmCents";

-- CreateIndex
CREATE UNIQUE INDEX "Sale_groupId_key" ON "Sale"("groupId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_supplierAccountId_fkey" FOREIGN KEY ("supplierAccountId") REFERENCES "SupplierAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleItem" ADD CONSTRAINT "SaleItem_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleAttachment" ADD CONSTRAINT "SaleAttachment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SaleItemCustomers" ADD CONSTRAINT "_SaleItemCustomers_A_fkey" FOREIGN KEY ("A") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_SaleItemCustomers" ADD CONSTRAINT "_SaleItemCustomers_B_fkey" FOREIGN KEY ("B") REFERENCES "SaleItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


