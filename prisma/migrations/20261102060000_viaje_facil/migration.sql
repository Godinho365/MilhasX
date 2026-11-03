-- CreateTable
CREATE TABLE "ViajeFacil" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "deadline" TIMESTAMP(3) NOT NULL,
    "miles" INTEGER NOT NULL,
    "roundTrip" BOOLEAN NOT NULL DEFAULT false,
    "origin" TEXT,
    "destination" TEXT,
    "cabin" TEXT,
    "passengers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "milesInAccount" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ViajeFacil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ViajeFacil_userId_deadline_idx" ON "ViajeFacil"("userId", "deadline");

-- AddForeignKey
ALTER TABLE "ViajeFacil" ADD CONSTRAINT "ViajeFacil_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

