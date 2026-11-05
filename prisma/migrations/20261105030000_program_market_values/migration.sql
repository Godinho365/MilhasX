-- Valor de mercado do milheiro por programa (o "quanto o saldo vale vendido hoje"), informado pelo dono em 04/11/2026.
-- Depois disso, quem muda é o Admin › Programas.
UPDATE "Program" SET "marketValueCpmCents" = v.cpm, "updatedAt" = NOW()
FROM (VALUES ('LIVELO', 3050), ('ESFERA', 3050), ('LATAM', 2500), ('AZUL', 1600), ('SMILES', 1600)) AS v(code, cpm)
WHERE "Program"."code" = v.code;
