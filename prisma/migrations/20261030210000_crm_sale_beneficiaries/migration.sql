-- Vendas do CRM Milhas já lançadas: os passageiros da negociação passam a ocupar vaga no limite de CPFs
-- da conta (antes nenhum beneficiário era registrado). Só para vendas que ainda não têm beneficiários.
INSERT INTO "AccountBeneficiary" ("id", "userId", "accountId", "saleId", "name", "document", "usedAt", "createdAt")
SELECT 'ab_' || md5(d."id" || ':' || (p.ord)::text), d."userId", d."accountId", d."saleId",
       trim(p.value->>'name'), NULLIF(regexp_replace(coalesce(p.value->>'cpf', ''), '\D', '', 'g'), ''),
       s."occurredAt", CURRENT_TIMESTAMP
FROM "MilesDeal" d
JOIN "Sale" s ON s."id" = d."saleId"
CROSS JOIN LATERAL jsonb_array_elements(d."passengersData"::jsonb) WITH ORDINALITY AS p(value, ord)
WHERE d."saleId" IS NOT NULL AND d."accountId" IS NOT NULL
  AND jsonb_typeof(d."passengersData"::jsonb) = 'array'
  AND NOT EXISTS (SELECT 1 FROM "AccountBeneficiary" b WHERE b."saleId" = d."saleId")
ON CONFLICT ("id") DO NOTHING;
