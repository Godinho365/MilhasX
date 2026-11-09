-- Limpar o chat só no app: até qual mensagem (no Telegram nada muda)
ALTER TABLE "TelegramLink" ADD COLUMN "clearedUpTo" INTEGER;
ALTER TABLE "TelegramDm" ADD COLUMN "clearedUpTo" INTEGER;
