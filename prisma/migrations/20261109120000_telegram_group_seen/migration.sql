-- Chat Balcões: até onde cada grupo foi visto no app (bolinha de não vistas na aba)
ALTER TABLE "TelegramGroup" ADD COLUMN "seenUpTo" INTEGER;
