-- CreateTable
CREATE TABLE "BalcaoLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenEnc" TEXT NOT NULL,
    "memberName" TEXT,
    "memberUsername" TEXT,
    "memberRole" TEXT,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canSell" BOOLEAN NOT NULL DEFAULT false,
    "cursor" TEXT,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BalcaoLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BalcaoLink_userId_key" ON "BalcaoLink"("userId");

-- AddForeignKey
ALTER TABLE "BalcaoLink" ADD CONSTRAINT "BalcaoLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

