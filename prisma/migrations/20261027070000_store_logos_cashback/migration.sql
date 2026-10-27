-- AlterTable
ALTER TABLE "Store" ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "StoreLogo" (
    "storeId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sourceUrl" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreLogo_pkey" PRIMARY KEY ("storeId")
);

-- CreateTable
CREATE TABLE "CashbackDay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "portal" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "bps" INTEGER NOT NULL,
    "maxBps" INTEGER NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashbackDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CashbackDay_storeId_source_day_key" ON "CashbackDay"("storeId", "source", "day");

-- AddForeignKey
ALTER TABLE "StoreLogo" ADD CONSTRAINT "StoreLogo_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashbackDay" ADD CONSTRAINT "CashbackDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

