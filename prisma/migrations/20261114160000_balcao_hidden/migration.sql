-- Balcão MilhasX: encerradas que a conta limpou da lista (negociações e propostas)
ALTER TABLE "BalcaoLink" ADD COLUMN "hiddenDeals" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "BalcaoLink" ADD COLUMN "hiddenProposals" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
