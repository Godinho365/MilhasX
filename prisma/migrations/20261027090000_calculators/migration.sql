-- CreateTable
CREATE TABLE "TransferPartner" (
    "id" TEXT NOT NULL,
    "fromProgramId" TEXT NOT NULL,
    "toProgramId" TEXT NOT NULL,
    "fromUnits" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "toUnits" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TransferPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClubPlan" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "modality" TEXT NOT NULL DEFAULT 'Mensal',
    "miles" INTEGER NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "signupBonus" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClubPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferPartner_fromProgramId_toProgramId_key" ON "TransferPartner"("fromProgramId", "toProgramId");

-- CreateIndex
CREATE UNIQUE INDEX "ClubPlan_programId_name_modality_key" ON "ClubPlan"("programId", "name", "modality");

-- AddForeignKey
ALTER TABLE "TransferPartner" ADD CONSTRAINT "TransferPartner_fromProgramId_fkey" FOREIGN KEY ("fromProgramId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferPartner" ADD CONSTRAINT "TransferPartner_toProgramId_fkey" FOREIGN KEY ("toProgramId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClubPlan" ADD CONSTRAINT "ClubPlan_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Parcerias 1:1 conhecidas entre os programas que já existem (o admin ajusta em Administração > Calculadoras)
INSERT INTO "TransferPartner" ("id", "fromProgramId", "toProgramId", "fromUnits", "toUnits", "updatedAt")
SELECT 'tp_' || md5(f."id" || t."id"), f."id", t."id", 1, 1, NOW()
FROM "Program" f JOIN "Program" t ON (f."code", t."code") IN (('LIVELO','SMILES'),('LIVELO','LATAM'),('LIVELO','AZUL'),('ESFERA','SMILES'),('ESFERA','LATAM'),('ESFERA','AZUL'))
ON CONFLICT DO NOTHING;
