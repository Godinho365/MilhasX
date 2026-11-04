-- Vendas do CRM Milhas lançadas sem a quantidade de CPFs ficaram com 0 CPFs (sem lucro por CPF e sem ocupar
-- vaga no limite de CPFs da conta). Toda emissão usa ao menos um CPF: o combinado, os passageiros informados
-- (o maior) ou, sem nenhum, 1 — a mesma regra do código (dealCpfs).
UPDATE "SaleItem" i
SET "passengers" = GREATEST(
  COALESCE(d."passengers", 0),
  CASE WHEN jsonb_typeof(d."passengersData") = 'array' THEN jsonb_array_length(d."passengersData") ELSE 0 END,
  1
)
FROM "MilesDeal" d
WHERE d."saleId" = i."saleId" AND i."issuedWith" = 'POINTS' AND i."passengers" IS NULL;

-- Venda sem beneficiário nenhum: os CPFs da emissão ocupam vaga na conta como "Anônimo"
INSERT INTO "AccountBeneficiary" ("id", "userId", "accountId", "saleId", "name", "document", "usedAt")
SELECT gen_random_uuid()::text, d."userId", d."accountId", d."saleId", 'Anônimo', NULL, s."occurredAt"
FROM "MilesDeal" d
JOIN "Sale" s ON s."id" = d."saleId"
CROSS JOIN LATERAL generate_series(1, GREATEST(
  COALESCE(d."passengers", 0),
  CASE WHEN jsonb_typeof(d."passengersData") = 'array' THEN jsonb_array_length(d."passengersData") ELSE 0 END,
  1
))
WHERE d."accountId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "AccountBeneficiary" b WHERE b."saleId" = d."saleId");
