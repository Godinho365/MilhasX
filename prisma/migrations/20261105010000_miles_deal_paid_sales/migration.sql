-- CRM Milhas: a venda passa a nascer em "Emitido" (a receber) e fica paga em "Pago". As vendas das
-- negociações que já estavam em "Pago" foram lançadas sem a data de pagamento: recebem o dia da venda
-- (horário de Brasília), que era quando o comprovante foi anexado.
UPDATE "Sale" s
SET "paidAt" = date_trunc('day', s."occurredAt" - interval '3 hours')
FROM "MilesDeal" d
WHERE d."saleId" = s."id" AND d."stage" = 'PAID' AND s."paidAt" IS NULL;
