-- Tráfego: conexão com o Meta (token criptografado), cópia das consultas e a origem (UTM) dos pedidos pela página
-- AlterTable
ALTER TABLE "TravelOrder" ADD COLUMN     "utm" JSONB;

-- CreateTable
CREATE TABLE "TrafficConnection" (
    "userId" TEXT NOT NULL,
    "metaUserId" TEXT NOT NULL,
    "metaUserName" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "accounts" JSONB NOT NULL,
    "selected" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'OK',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrafficConnection_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "TrafficReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrafficReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrafficReport_userId_key_key" ON "TrafficReport"("userId", "key");

-- AddForeignKey
ALTER TABLE "TrafficConnection" ADD CONSTRAINT "TrafficConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrafficReport" ADD CONSTRAINT "TrafficReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

