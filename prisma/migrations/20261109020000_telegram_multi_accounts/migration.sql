-- Várias contas do Telegram por usuário (uma por número)
DROP INDEX "TelegramLink_userId_key";
CREATE INDEX "TelegramLink_userId_idx" ON "TelegramLink"("userId");
CREATE UNIQUE INDEX "TelegramLink_userId_phone_key" ON "TelegramLink"("userId", "phone");
