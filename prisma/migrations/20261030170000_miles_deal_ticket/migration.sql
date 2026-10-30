-- CRM Milhas: bilhete anexado (a negociação só fica "Emitida" com ele)
-- CreateTable
CREATE TABLE "MilesDealTicket" (
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilesDealTicket_pkey" PRIMARY KEY ("dealId")
);

-- AddForeignKey
ALTER TABLE "MilesDealTicket" ADD CONSTRAINT "MilesDealTicket_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MilesDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

