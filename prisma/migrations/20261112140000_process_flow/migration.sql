-- Processos: o fluxograma (etapas, decisões e ligações) de cada processo
ALTER TABLE "Process" ADD COLUMN IF NOT EXISTS "flow" JSONB;
