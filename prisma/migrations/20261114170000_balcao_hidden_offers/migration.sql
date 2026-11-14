-- Balcão MilhasX: ofertas de compra encerradas que a conta limpou da lista (Minhas compras)
ALTER TABLE "BalcaoLink" ADD COLUMN "hiddenOffers" INTEGER[] DEFAULT ARRAY[]::INTEGER[];
