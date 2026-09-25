-- CreateEnum
CREATE TYPE "PurchasePaymentTerms" AS ENUM ('CASH', 'CREDIT');

-- CreateEnum
CREATE TYPE "PayableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "ReceivableStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "payableStatus" "PayableStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "paymentTerms" "PurchasePaymentTerms" NOT NULL DEFAULT 'CASH';

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "avgCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "code" TEXT,
ADD COLUMN     "lastCostCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "minStockQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "cogsCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "lineCogsCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unitCogsCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "payableStatus" "PayableStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN     "paymentTerms" "PurchasePaymentTerms" NOT NULL DEFAULT 'CASH',
ADD COLUMN     "supplierId" TEXT;

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Waste" (
    "id" TEXT NOT NULL,
    "wastedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Waste_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WasteItem" (
    "id" TEXT NOT NULL,
    "wasteId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCostCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WasteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WasteItem_wasteId_idx" ON "WasteItem"("wasteId");

-- CreateIndex
CREATE INDEX "Expense_payableStatus_idx" ON "Expense"("payableStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_code_key" ON "Ingredient"("code");

-- CreateIndex
CREATE INDEX "Purchase_purchasedAt_idx" ON "Purchase"("purchasedAt");

-- CreateIndex
CREATE INDEX "Purchase_payableStatus_idx" ON "Purchase"("payableStatus");

-- CreateIndex
CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Waste" ADD CONSTRAINT "Waste_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteItem" ADD CONSTRAINT "WasteItem_wasteId_fkey" FOREIGN KEY ("wasteId") REFERENCES "Waste"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WasteItem" ADD CONSTRAINT "WasteItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill weighted avg from legacy cost column
UPDATE "Ingredient"
SET "avgCostCents" = "costPerUnitCents",
    "lastCostCents" = CASE WHEN "lastCostCents" = 0 THEN "costPerUnitCents" ELSE "lastCostCents" END
WHERE "avgCostCents" = 0 AND "costPerUnitCents" <> 0;

-- Immutable COGS snapshot after DRAFT (same rule as commission)
CREATE OR REPLACE FUNCTION forbid_cogs_snapshot_update() RETURNS trigger AS $$
BEGIN
  IF OLD.status <> 'DRAFT' AND (
       NEW."cogsCents" IS DISTINCT FROM OLD."cogsCents"
  ) THEN
    RAISE EXCEPTION 'El costo de ventas (COGS) de un pedido confirmado es inmutable';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_forbid_cogs_snapshot_update
  BEFORE UPDATE ON "Order"
  FOR EACH ROW
  EXECUTE FUNCTION forbid_cogs_snapshot_update();
