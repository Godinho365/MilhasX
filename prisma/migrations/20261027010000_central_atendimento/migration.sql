-- AlterTable
ALTER TABLE "SalesProfile" ADD COLUMN     "acceptsLeads" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "headline" TEXT;

-- CreateTable
CREATE TABLE "MilesLead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "ipHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MilesLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MilesLead_userId_createdAt_idx" ON "MilesLead"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "MilesLead" ADD CONSTRAINT "MilesLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

