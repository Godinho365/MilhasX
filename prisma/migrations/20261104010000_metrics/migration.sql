-- Métricas: emissores da venda (aba Equipe) e blocos escondidos por usuário
ALTER TABLE "Sale" ADD COLUMN "issuerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "UserPreference" ADD COLUMN "metricsHidden" TEXT[] DEFAULT ARRAY[]::TEXT[];
