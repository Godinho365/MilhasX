-- Cadastro: telefone, aceite dos termos e vínculo com a conta Google
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "googleId" TEXT;

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
