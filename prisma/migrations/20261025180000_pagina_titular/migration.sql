-- CreateTable
CREATE TABLE "HolderAccess" (
    "id" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "sessionHash" TEXT,
    "sessionExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolderAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HolderAccess_tokenHash_key" ON "HolderAccess"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "HolderAccess_sessionHash_key" ON "HolderAccess"("sessionHash");

-- CreateIndex
CREATE INDEX "HolderAccess_holderId_createdAt_idx" ON "HolderAccess"("holderId", "createdAt");

-- AddForeignKey
ALTER TABLE "HolderAccess" ADD CONSTRAINT "HolderAccess_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

