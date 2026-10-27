-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('PESSOAL', 'PRO', 'GESTOR');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'PESSOAL',
ADD COLUMN     "planInterval" TEXT,
ADD COLUMN     "planRequest" "Plan",
ADD COLUMN     "planRequestInterval" TEXT,
ADD COLUMN     "planRequestedAt" TIMESTAMP(3),
ADD COLUMN     "referralCode" TEXT,
ADD COLUMN     "referredById" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "hideVideoTutorials" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notifications" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "soundEffects" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usageAnalytics" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "valuesMode" TEXT NOT NULL DEFAULT 'VISIBLE';

-- CreateTable
CREATE TABLE "SalesProfile" (
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "whatsapp" TEXT,
    "instagram" TEXT,
    "email" TEXT,
    "programIds" TEXT[],
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesProfile_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesProfile_slug_key" ON "SalesProfile"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_referredById_fkey" FOREIGN KEY ("referredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesProfile" ADD CONSTRAINT "SalesProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

