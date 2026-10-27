-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "archived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "cpfAvailable" INTEGER,
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
