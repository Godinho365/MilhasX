-- Programa de pontos do cartão Nubank Ultravioleta: os pontos ficam no cartão e só vão para os
-- programas (Livelo, LATAM, Smiles…) por transferência.
INSERT INTO "Program" ("id", "name", "code", "kind", "active", "marketValueCpmCents", "color", "createdAt", "updatedAt")
VALUES ('prog_nubank_ultravioleta', 'Nubank Ultravioleta', 'NUBANK', 'POINTS', true, 0, '#820ad1', NOW(), NOW())
ON CONFLICT ("code") DO NOTHING;
