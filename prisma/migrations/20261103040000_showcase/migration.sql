-- AlterTable
ALTER TABLE "SalesProfile" ADD COLUMN     "showcaseActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showcaseTitle" TEXT;

-- CreateTable
CREATE TABLE "ShowcaseItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "title" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "period" TEXT,
    "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "description" TEXT,
    "priceCents" INTEGER,
    "priceNote" TEXT,
    "installments" TEXT,
    "image" BYTEA,
    "imageMime" TEXT,
    "imageUpdatedAt" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShowcaseItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShowcaseItem_userId_position_idx" ON "ShowcaseItem"("userId", "position");

-- AddForeignKey
ALTER TABLE "ShowcaseItem" ADD CONSTRAINT "ShowcaseItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

