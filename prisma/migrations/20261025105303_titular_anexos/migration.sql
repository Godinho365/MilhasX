-- AlterTable
ALTER TABLE "Holder" ADD COLUMN     "accessEmail" TEXT,
ADD COLUMN     "addressParts" JSONB;

-- CreateTable
CREATE TABLE "HolderAttachment" (
    "id" TEXT NOT NULL,
    "holderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolderAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HolderAttachment_holderId_idx" ON "HolderAttachment"("holderId");

-- AddForeignKey
ALTER TABLE "HolderAttachment" ADD CONSTRAINT "HolderAttachment_holderId_fkey" FOREIGN KEY ("holderId") REFERENCES "Holder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
