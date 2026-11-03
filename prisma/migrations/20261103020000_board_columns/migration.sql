-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "columnId" TEXT;

-- AlterTable
ALTER TABLE "TaskBoard" ADD COLUMN     "columns" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "description" TEXT,
ADD COLUMN     "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restricted" BOOLEAN NOT NULL DEFAULT false;


-- quadros que já existiam ficam com as colunas básicas
UPDATE "TaskBoard" SET "columns" = '[{"id":"todo","name":"A fazer"},{"id":"doing","name":"Em andamento"},{"id":"done","name":"Concluído"}]'::jsonb;
