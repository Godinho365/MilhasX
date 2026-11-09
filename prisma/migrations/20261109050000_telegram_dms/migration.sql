-- Conversas no privado abertas pelo Chat Balcões
CREATE TABLE "TelegramDm" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "peerId" TEXT NOT NULL,
    "peerHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramDm_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramDm_linkId_peerId_key" ON "TelegramDm"("linkId", "peerId");
CREATE INDEX "TelegramDm_userId_idx" ON "TelegramDm"("userId");

ALTER TABLE "TelegramDm" ADD CONSTRAINT "TelegramDm_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramDm" ADD CONSTRAINT "TelegramDm_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TelegramLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
