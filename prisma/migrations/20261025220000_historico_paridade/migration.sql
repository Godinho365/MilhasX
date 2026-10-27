-- AlterTable
ALTER TABLE "StoreOffer" ADD COLUMN     "clubPointsPerReal" INTEGER,
ADD COLUMN     "observedAt" TIMESTAMP(3),
ADD COLUMN     "partnerLink" TEXT,
ADD COLUMN     "promoEndsAt" TIMESTAMP(3),
ADD COLUMN     "promotion" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "regularPointsPerReal" INTEGER;

-- CreateTable
CREATE TABLE "ParityDay" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "pointsPerReal" INTEGER NOT NULL,
    "maxPointsPerReal" INTEGER NOT NULL,
    "clubPointsPerReal" INTEGER,
    "perDollar" BOOLEAN NOT NULL DEFAULT false,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "maxObservedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParityDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ParityDay_programId_day_idx" ON "ParityDay"("programId", "day");

-- CreateIndex
CREATE UNIQUE INDEX "ParityDay_storeId_programId_source_day_key" ON "ParityDay"("storeId", "programId", "source", "day");

-- AddForeignKey
ALTER TABLE "ParityDay" ADD CONSTRAINT "ParityDay_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParityDay" ADD CONSTRAINT "ParityDay_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

