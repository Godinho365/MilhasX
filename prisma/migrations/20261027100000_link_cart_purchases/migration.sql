-- Compras de pontos no carrinho gravadas antes desta versão ficavam fora do grupo da transferência:
-- liga cada uma à transferência criada 1 ms depois na mesma conta (é assim que o sistema as grava).
UPDATE "Entry" p
SET "groupId" = t."groupId"
FROM "Entry" t
WHERE p."type" = 'PURCHASE'
  AND p."groupId" IS NULL
  AND p."description" LIKE 'Compra de pontos para transferência%'
  AND t."type" = 'TRANSFER_OUT'
  AND t."groupId" IS NOT NULL
  AND t."accountId" = p."accountId"
  AND t."createdAt" = p."createdAt" + INTERVAL '1 millisecond';
