-- Vários grupos de balcão por conta do Telegram: o grupo sai da conta e vira uma lista (cada um é um chat).
CREATE TABLE "TelegramGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "peer" JSONB,
    "clearedUpTo" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramGroup_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TelegramGroup_linkId_groupId_key" ON "TelegramGroup"("linkId", "groupId");
CREATE INDEX "TelegramGroup_userId_idx" ON "TelegramGroup"("userId");

ALTER TABLE "TelegramGroup" ADD CONSTRAINT "TelegramGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TelegramGroup" ADD CONSTRAINT "TelegramGroup_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "TelegramLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- o grupo que cada conta já tinha vira o primeiro da lista (com o acesso direto e o "limpar")
INSERT INTO "TelegramGroup" ("id", "userId", "linkId", "groupId", "title", "peer", "clearedUpTo", "createdAt")
SELECT 'tgg' || substr(md5(random()::text || clock_timestamp()::text || "id"), 1, 22), "userId", "id", "groupId", COALESCE("groupTitle", ''), "groupPeer", "clearedUpTo", "updatedAt"
FROM "TelegramLink" WHERE "groupId" IS NOT NULL;

-- conversa no privado guarda de qual grupo a pessoa veio
ALTER TABLE "TelegramDm" ADD COLUMN "groupTitle" TEXT;
UPDATE "TelegramDm" d SET "groupTitle" = l."groupTitle" FROM "TelegramLink" l WHERE d."linkId" = l."id";

ALTER TABLE "TelegramLink" DROP COLUMN "groupId", DROP COLUMN "groupTitle", DROP COLUMN "groupPeer", DROP COLUMN "clearedUpTo";
