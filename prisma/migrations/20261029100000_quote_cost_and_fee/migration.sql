-- Cotações: custo do milheiro (ex.: comprado no balcão) e taxa de emissão cobrada do cliente
-- (valor fixo ou % do total da passagem), para o preço em dinheiro e o potencial de lucro
ALTER TABLE "FlightQuote" ADD COLUMN "costCpmCents" INTEGER;
ALTER TABLE "FlightQuote" ADD COLUMN "issueFeeCents" INTEGER;
ALTER TABLE "FlightQuote" ADD COLUMN "issueFeeBps" INTEGER;
