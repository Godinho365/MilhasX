-- Equipe com acesso próprio: o membro entra com login próprio (User com workspaceOwnerId = o dono da conta) e
-- trabalha nos dados do dono só nas áreas da função dele (TeamMember: função, permissões, convite). Só acrescenta.

-- AlterTable
ALTER TABLE "TeamMember" ADD COLUMN     "accessRole" TEXT,
ADD COLUMN     "inviteExpiresAt" TIMESTAMP(3),
ADD COLUMN     "inviteTokenHash" TEXT,
ADD COLUMN     "invitedAt" TIMESTAMP(3),
ADD COLUMN     "joinedAt" TIMESTAMP(3),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "loginUserId" TEXT,
ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "workspaceOwnerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_loginUserId_key" ON "TeamMember"("loginUserId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_inviteTokenHash_key" ON "TeamMember"("inviteTokenHash");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_workspaceOwnerId_fkey" FOREIGN KEY ("workspaceOwnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_loginUserId_fkey" FOREIGN KEY ("loginUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- CreateIndex
CREATE INDEX "User_workspaceOwnerId_idx" ON "User"("workspaceOwnerId");
