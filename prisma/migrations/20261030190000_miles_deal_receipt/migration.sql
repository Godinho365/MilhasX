-- CRM Milhas: comprovante de pagamento (a negociação só vai para "Pago" e vira venda com ele)
-- CreateTable
CREATE TABLE "MilesDealReceipt" (
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilesDealReceipt_pkey" PRIMARY KEY ("dealId")
);

-- AddForeignKey
ALTER TABLE "MilesDealReceipt" ADD CONSTRAINT "MilesDealReceipt_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "MilesDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

