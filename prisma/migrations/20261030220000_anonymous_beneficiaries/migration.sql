-- Vendas já lançadas com passageiros sem nome: o que falta vira beneficiário "Anônimo" (cada um ocupa uma
-- vaga no limite de CPFs). Nomes cadastrados à mão na mesma conta e no mesmo dia da venda contam primeiro.
WITH item AS (
  SELECT s."id" AS sale_id, s."userId", s."accountId", s."occurredAt",
         SUM(CASE WHEN i."kind" = 'FLIGHT'
                  THEN COALESCE(i."passengers", GREATEST(1, (SELECT COUNT(*) FROM "_SaleItemCustomers" x WHERE x."B" = i."id")::int))
                  ELSE COALESCE(i."passengers", 0) END) AS expected
  FROM "Sale" s JOIN "SaleItem" i ON i."saleId" = s."id"
  WHERE s."origin" = 'OWN' AND s."accountId" IS NOT NULL AND i."issuedWith" = 'POINTS'
  GROUP BY s."id"
), gap AS (
  SELECT it.*, GREATEST(0, it.expected - (SELECT COUNT(*) FROM "AccountBeneficiary" b WHERE b."saleId" = it.sale_id))::int AS missing,
         (SELECT COUNT(*) FROM "AccountBeneficiary" b
           WHERE b."saleId" IS NULL AND b."accountId" = it."accountId" AND b."usedAt"::date = it."occurredAt"::date)::int AS manual_day
  FROM item it
), alloc AS (
  SELECT g.*, SUM(g.missing) OVER (PARTITION BY g."accountId", g."occurredAt"::date ORDER BY g."occurredAt", g.sale_id) AS cum
  FROM gap g
), need AS (
  SELECT a.*, (GREATEST(0, a.cum - a.manual_day) - GREATEST(0, a.cum - a.missing - a.manual_day))::int AS anon
  FROM alloc a
)
INSERT INTO "AccountBeneficiary" ("id", "userId", "accountId", "saleId", "name", "document", "usedAt", "createdAt")
SELECT 'ab_anon_' || md5(n.sale_id || ':' || k::text), n."userId", n."accountId", n.sale_id, 'Anônimo', NULL, n."occurredAt", CURRENT_TIMESTAMP
FROM need n CROSS JOIN LATERAL generate_series(1, n.anon) AS k
WHERE n.anon > 0
ON CONFLICT ("id") DO NOTHING;
