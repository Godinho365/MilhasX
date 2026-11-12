-- Chat Balcões em tempo real (etapa 1): mensagens gravadas pelo listener do Telegram, o registro de eventos em
-- ordem (para quem reconecta pedir "desde o id X") e até onde cada chat foi sincronizado. Só acrescenta.

-- AlterTable
ALTER TABLE "TelegramDm" ADD COLUMN     "syncedAt" TIMESTAMP(3),
ADD COLUMN     "syncedUpTo" INTEGER;

-- AlterTable
ALTER TABLE "TelegramGroup" ADD COLUMN     "syncedAt" TIMESTAMP(3),
ADD COLUMN     "syncedUpTo" INTEGER;

-- CreateTable
CREATE TABLE "TelegramMessage" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "groupId" TEXT,
    "dmId" TEXT,
    "msgId" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "editDate" TIMESTAMP(3),
    "senderId" TEXT,
    "senderName" TEXT NOT NULL,
    "out" BOOLEAN NOT NULL DEFAULT false,
    "fromUser" BOOLEAN NOT NULL DEFAULT true,
    "text" TEXT NOT NULL DEFAULT '',
    "replyTo" INTEGER,
    "fwd" BOOLEAN NOT NULL DEFAULT false,
    "media" TEXT,
    "mediaKind" TEXT,
    "mediaName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramEvent" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "chatKind" TEXT,
    "chatId" TEXT,
    "msgId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TelegramMessage_userId_idx" ON "TelegramMessage"("userId");

-- CreateIndex
CREATE INDEX "TelegramMessage_linkId_idx" ON "TelegramMessage"("linkId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramMessage_groupId_msgId_key" ON "TelegramMessage"("groupId", "msgId");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramMessage_dmId_msgId_key" ON "TelegramMessage"("dmId", "msgId");

-- CreateIndex
CREATE INDEX "TelegramEvent_userId_id_idx" ON "TelegramEvent"("userId", "id");

-- CreateIndex
CREATE INDEX "TelegramEvent_createdAt_idx" ON "TelegramEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TelegramLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TelegramGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_dmId_fkey" FOREIGN KEY ("dmId") REFERENCES "TelegramDm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TelegramEvent" ADD CONSTRAINT "TelegramEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Cada mensagem é de exatamente um chat: um grupo ou uma conversa no privado
ALTER TABLE "TelegramMessage" ADD CONSTRAINT "TelegramMessage_one_chat_check" CHECK (("groupId" IS NULL) <> ("dmId" IS NULL));
