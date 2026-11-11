-- Chat Balcões em tempo real: o gateway apaga as mensagens gravadas além do prazo de guarda (TG_MESSAGE_RETENTION_DAYS,
-- padrão 90 dias) procurando pela data
CREATE INDEX "TelegramMessage_date_idx" ON "TelegramMessage"("date");
