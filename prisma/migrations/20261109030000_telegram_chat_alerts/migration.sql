-- Chat Balcões: acesso direto ao grupo escolhido e alertas por palavras
ALTER TABLE "TelegramLink" ADD COLUMN "groupPeer" JSONB;

CREATE TABLE "TelegramAlert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "words" TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramAlert_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TelegramAlert_userId_idx" ON "TelegramAlert"("userId");

ALTER TABLE "TelegramAlert" ADD CONSTRAINT "TelegramAlert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
