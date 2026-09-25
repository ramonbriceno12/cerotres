DO $$ BEGIN
  CREATE TYPE "CashSessionStatus" AS ENUM ('OPEN', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- AlterTable
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "exchangeRateBolivarsPerUsd" DECIMAL(18,4);

ALTER TABLE "OrderItemOption" ADD COLUMN IF NOT EXISTS "lineCogsCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItemOption" ADD COLUMN IF NOT EXISTS "unitCogsCents" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "amountBolivarsCents" INTEGER;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "exchangeRateBolivarsPerUsd" DECIMAL(18,4);

CREATE TABLE IF NOT EXISTS "ModifierOptionRecipeItem" (
    "id" TEXT NOT NULL,
    "modifierOptionId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ModifierOptionRecipeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ExchangeRate" (
    "id" TEXT NOT NULL,
    "bolivarsPerUsd" DECIMAL(18,4) NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CashSession" (
    "id" TEXT NOT NULL,
    "status" "CashSessionStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openingFloatCents" INTEGER NOT NULL DEFAULT 0,
    "expectedCashCents" INTEGER,
    "expectedZelleCents" INTEGER,
    "expectedPagoMovilCents" INTEGER,
    "expectedTransferCents" INTEGER,
    "expectedOtherCents" INTEGER,
    "countedCashCents" INTEGER,
    "countedZelleCents" INTEGER,
    "countedPagoMovilCents" INTEGER,
    "countedTransferCents" INTEGER,
    "countedOtherCents" INTEGER,
    "differenceCashCents" INTEGER,
    "notes" TEXT,
    "openedById" TEXT NOT NULL,
    "closedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CashSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ModifierOptionRecipeItem_modifierOptionId_idx" ON "ModifierOptionRecipeItem"("modifierOptionId");
CREATE UNIQUE INDEX IF NOT EXISTS "ModifierOptionRecipeItem_modifierOptionId_ingredientId_key" ON "ModifierOptionRecipeItem"("modifierOptionId", "ingredientId");
CREATE INDEX IF NOT EXISTS "ExchangeRate_effectiveFrom_idx" ON "ExchangeRate"("effectiveFrom");
CREATE INDEX IF NOT EXISTS "CashSession_status_openedAt_idx" ON "CashSession"("status", "openedAt");

DO $$ BEGIN
 ALTER TABLE "ModifierOptionRecipeItem" ADD CONSTRAINT "ModifierOptionRecipeItem_modifierOptionId_fkey" FOREIGN KEY ("modifierOptionId") REFERENCES "ModifierOption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "ModifierOptionRecipeItem" ADD CONSTRAINT "ModifierOptionRecipeItem_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
 ALTER TABLE "CashSession" ADD CONSTRAINT "CashSession_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
