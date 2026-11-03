-- Tarefas em quadros (vários membros, checklist, anexos, comentários, recorrência), emissor na equipe e parceiros com comissão.
-- DropForeignKey
ALTER TABLE "Task" DROP CONSTRAINT "Task_memberId_fkey";

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "partnerCommissionCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "partnerId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "boardId" TEXT,
ADD COLUMN     "checklist" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "dueTime" TEXT,
ADD COLUMN     "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "recurrence" TEXT NOT NULL DEFAULT 'NONE';

-- o responsável único passa para a lista de membros antes de sair a coluna antiga
UPDATE "Task" SET "memberIds" = ARRAY["memberId"] WHERE "memberId" IS NOT NULL;
ALTER TABLE "Task" DROP COLUMN "memberId";

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "issuer" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "TaskBoard" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskBoard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskComment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'COMMENT',
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaskAttachment" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaskAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'PROFIT_PCT',
    "value" INTEGER NOT NULL,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TaskBoard_userId_idx" ON "TaskBoard"("userId");

-- CreateIndex
CREATE INDEX "TaskComment_taskId_createdAt_idx" ON "TaskComment"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "TaskAttachment_taskId_idx" ON "TaskAttachment"("taskId");

-- CreateIndex
CREATE INDEX "Partner_userId_idx" ON "Partner"("userId");

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskBoard" ADD CONSTRAINT "TaskBoard_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "TaskBoard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskComment" ADD CONSTRAINT "TaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaskAttachment" ADD CONSTRAINT "TaskAttachment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

