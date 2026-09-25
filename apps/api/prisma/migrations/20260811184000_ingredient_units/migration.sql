-- CreateEnum
CREATE TYPE "UnitDimension" AS ENUM ('MASS', 'VOLUME', 'COUNT', 'OTHER');

-- CreateTable
CREATE TABLE "Unit" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "dimension" "UnitDimension" NOT NULL,
    "toCanonical" DECIMAL(18,9) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Unit_pkey" PRIMARY KEY ("code")
);

-- Seed system units before FK
INSERT INTO "Unit" ("code", "name", "dimension", "toCanonical", "sortOrder", "isActive", "createdAt", "updatedAt") VALUES
  ('kg', 'Kilogramo', 'MASS', 1, 1, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('g', 'Gramo', 'MASS', 0.001, 2, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('l', 'Litro', 'VOLUME', 1, 3, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ml', 'Mililitro', 'VOLUME', 0.001, 4, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('und', 'Unidad', 'COUNT', 1, 5, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Normalize legacy free-text units on Ingredient
UPDATE "Ingredient"
SET "unit" = lower(trim("unit"));

UPDATE "Ingredient" SET "unit" = 'g' WHERE "unit" IN ('gr', 'gramos', 'gram', 'grams');
UPDATE "Ingredient" SET "unit" = 'kg' WHERE "unit" IN ('kilo', 'kilos', 'kilogramo', 'kilogramos');
UPDATE "Ingredient" SET "unit" = 'l' WHERE "unit" IN ('lt', 'litro', 'litros');
UPDATE "Ingredient" SET "unit" = 'ml' WHERE "unit" IN ('mililitro', 'mililitros');
UPDATE "Ingredient" SET "unit" = 'und' WHERE "unit" IN ('un', 'u', 'unidad', 'unidades');

-- Register any remaining unknown units as OTHER so FK can be added
INSERT INTO "Unit" ("code", "name", "dimension", "toCanonical", "sortOrder", "isActive", "createdAt", "updatedAt")
SELECT DISTINCT i."unit", i."unit", 'OTHER'::"UnitDimension", 1, 100, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Ingredient" i
WHERE NOT EXISTS (SELECT 1 FROM "Unit" u WHERE u."code" = i."unit");

-- CreateTable
CREATE TABLE "IngredientUnitConversion" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "unitCode" TEXT NOT NULL,
    "factorToBase" DECIMAL(18,9) NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IngredientUnitConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IngredientUnitConversion_ingredientId_idx" ON "IngredientUnitConversion"("ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "IngredientUnitConversion_ingredientId_unitCode_key" ON "IngredientUnitConversion"("ingredientId", "unitCode");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_unit_fkey" FOREIGN KEY ("unit") REFERENCES "Unit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientUnitConversion" ADD CONSTRAINT "IngredientUnitConversion_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientUnitConversion" ADD CONSTRAINT "IngredientUnitConversion_unitCode_fkey" FOREIGN KEY ("unitCode") REFERENCES "Unit"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
