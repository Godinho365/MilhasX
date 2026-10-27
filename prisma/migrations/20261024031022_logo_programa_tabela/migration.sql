/*
  Warnings:

  - You are about to drop the column `logo` on the `Program` table. All the data in the column will be lost.
  - You are about to drop the column `logoMime` on the `Program` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Program" DROP COLUMN "logo",
DROP COLUMN "logoMime";

-- CreateTable
CREATE TABLE "ProgramLogo" (
    "programId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,

    CONSTRAINT "ProgramLogo_pkey" PRIMARY KEY ("programId")
);

-- AddForeignKey
ALTER TABLE "ProgramLogo" ADD CONSTRAINT "ProgramLogo_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
