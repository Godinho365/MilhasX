-- CreateEnum
CREATE TYPE "OrderStage" AS ENUM ('NEW', 'QUOTING', 'QUOTE_SENT', 'NEGOTIATION', 'ISSUED', 'TRAVELING', 'DONE');

-- AlterTable
ALTER TABLE "SalesProfile" ADD COLUMN     "acceptsOrders" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TravelOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "customerEmail" TEXT,
    "stage" "OrderStage" NOT NULL DEFAULT 'NEW',
    "position" INTEGER NOT NULL DEFAULT 0,
    "tripType" TEXT NOT NULL DEFAULT 'ONE_WAY',
    "cabin" TEXT NOT NULL DEFAULT 'ECONOMY',
    "segments" JSONB NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "infants" INTEGER NOT NULL DEFAULT 0,
    "flexibleDates" BOOLEAN NOT NULL DEFAULT false,
    "checkedBag" BOOLEAN NOT NULL DEFAULT false,
    "priority" TEXT NOT NULL DEFAULT 'MEDIUM',
    "budgetCents" INTEGER,
    "notes" TEXT,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TravelOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAttachment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "visibleToClient" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightQuote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "program" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "departDate" DATE NOT NULL,
    "returnDate" DATE,
    "cabin" TEXT NOT NULL DEFAULT 'ECONOMY',
    "adults" INTEGER NOT NULL DEFAULT 1,
    "miles" INTEGER,
    "taxesCents" INTEGER,
    "cashCents" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlightQuote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlightSearch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "programs" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FlightSearch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TravelOrder_userId_stage_idx" ON "TravelOrder"("userId", "stage");

-- CreateIndex
CREATE UNIQUE INDEX "TravelOrder_userId_number_key" ON "TravelOrder"("userId", "number");

-- CreateIndex
CREATE INDEX "OrderEvent_orderId_createdAt_idx" ON "OrderEvent"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "FlightQuote_userId_origin_destination_idx" ON "FlightQuote"("userId", "origin", "destination");

-- CreateIndex
CREATE INDEX "FlightSearch_userId_createdAt_idx" ON "FlightSearch"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "TravelOrder" ADD CONSTRAINT "TravelOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TravelOrder" ADD CONSTRAINT "TravelOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAttachment" ADD CONSTRAINT "OrderAttachment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TravelOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderEvent" ADD CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TravelOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightQuote" ADD CONSTRAINT "FlightQuote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightQuote" ADD CONSTRAINT "FlightQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "TravelOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlightSearch" ADD CONSTRAINT "FlightSearch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

