-- AlterEnum
ALTER TYPE "BonusPurchaseStatus" ADD VALUE 'DELIVERED';

-- AlterTable
ALTER TABLE "BonusPurchase" ADD COLUMN     "costs" JSONB,
ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "description" TEXT,
ADD COLUMN     "expectedDeliveryAt" TIMESTAMP(3),
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "PurchaseAttachment" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PurchaseAttachment_purchaseId_idx" ON "PurchaseAttachment"("purchaseId");

-- AddForeignKey
ALTER TABLE "PurchaseAttachment" ADD CONSTRAINT "PurchaseAttachment_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "BonusPurchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
