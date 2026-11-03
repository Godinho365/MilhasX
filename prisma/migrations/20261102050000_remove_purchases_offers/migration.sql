-- Remove Compras (compras bonificadas) e Promoções (lojas, ofertas, promoções e importação de lojas).
-- Os alertas de loja e de promoção saem; fica só o alerta de saldo mínimo.
DELETE FROM "Alert" WHERE "type" IN ('STORE_POINTS', 'PROMOTION');

-- AlterEnum
BEGIN;
CREATE TYPE "AlertType_new" AS ENUM ('MIN_BALANCE');
ALTER TABLE "Alert" ALTER COLUMN "type" TYPE "AlertType_new" USING ("type"::text::"AlertType_new");
ALTER TYPE "AlertType" RENAME TO "AlertType_old";
ALTER TYPE "AlertType_new" RENAME TO "AlertType";
DROP TYPE "public"."AlertType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "Alert" DROP CONSTRAINT "Alert_storeId_fkey";

-- DropForeignKey
ALTER TABLE "BonusPurchase" DROP CONSTRAINT "BonusPurchase_accountId_fkey";

-- DropForeignKey
ALTER TABLE "BonusPurchase" DROP CONSTRAINT "BonusPurchase_entryId_fkey";

-- DropForeignKey
ALTER TABLE "BonusPurchase" DROP CONSTRAINT "BonusPurchase_storeId_fkey";

-- DropForeignKey
ALTER TABLE "BonusPurchase" DROP CONSTRAINT "BonusPurchase_userId_fkey";

-- DropForeignKey
ALTER TABLE "CashbackDay" DROP CONSTRAINT "CashbackDay_storeId_fkey";

-- DropForeignKey
ALTER TABLE "FavoriteStore" DROP CONSTRAINT "FavoriteStore_storeId_fkey";

-- DropForeignKey
ALTER TABLE "FavoriteStore" DROP CONSTRAINT "FavoriteStore_userId_fkey";

-- DropForeignKey
ALTER TABLE "ParityDay" DROP CONSTRAINT "ParityDay_programId_fkey";

-- DropForeignKey
ALTER TABLE "ParityDay" DROP CONSTRAINT "ParityDay_storeId_fkey";

-- DropForeignKey
ALTER TABLE "Promotion" DROP CONSTRAINT "Promotion_fromProgramId_fkey";

-- DropForeignKey
ALTER TABLE "Promotion" DROP CONSTRAINT "Promotion_toProgramId_fkey";

-- DropForeignKey
ALTER TABLE "PurchaseAttachment" DROP CONSTRAINT "PurchaseAttachment_purchaseId_fkey";

-- DropForeignKey
ALTER TABLE "StoreLogo" DROP CONSTRAINT "StoreLogo_storeId_fkey";

-- DropForeignKey
ALTER TABLE "StoreOffer" DROP CONSTRAINT "StoreOffer_programId_fkey";

-- DropForeignKey
ALTER TABLE "StoreOffer" DROP CONSTRAINT "StoreOffer_storeId_fkey";

-- AlterTable
ALTER TABLE "Alert" DROP COLUMN "storeId";

-- AlterTable
ALTER TABLE "Entry" DROP COLUMN "storeId";

-- DropTable
DROP TABLE "BonusPurchase";

-- DropTable
DROP TABLE "CashbackDay";

-- DropTable
DROP TABLE "FavoriteStore";

-- DropTable
DROP TABLE "ParityDay";

-- DropTable
DROP TABLE "Promotion";

-- DropTable
DROP TABLE "PurchaseAttachment";

-- DropTable
DROP TABLE "Store";

-- DropTable
DROP TABLE "StoreImportRun";

-- DropTable
DROP TABLE "StoreLogo";

-- DropTable
DROP TABLE "StoreOffer";

-- DropEnum
DROP TYPE "BonusPurchaseStatus";

-- DropEnum
DROP TYPE "PromotionKind";

