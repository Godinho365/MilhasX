-- Privacidade: a escolha de cookies guardada na conta (vale em todos os aparelhos) e os pedidos de titulares (LGPD)
-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "cookieConsent" JSONB;

-- CreateTable
CREATE TABLE "PrivacyRequest" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivacyRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivacyRequest_createdAt_idx" ON "PrivacyRequest"("createdAt");

-- CreateIndex
CREATE INDEX "PrivacyRequest_ipHash_createdAt_idx" ON "PrivacyRequest"("ipHash", "createdAt");
