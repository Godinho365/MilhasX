-- Conta do Telegram conectada pelo usuário (para ler o grupo do balcão); a sessão fica criptografada
CREATE TABLE "TelegramLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CODE_SENT',
    "phone" TEXT NOT NULL,
    "phoneCodeHash" TEXT,
    "codeViaApp" BOOLEAN NOT NULL DEFAULT true,
    "accountName" TEXT,
    "groupId" TEXT,
    "groupTitle" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramLink_userId_key" ON "TelegramLink"("userId");

ALTER TABLE "TelegramLink" ADD CONSTRAINT "TelegramLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
