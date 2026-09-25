-- CreateTable
CREATE TABLE "ProductChannelPrice" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductChannelPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductChannelPrice_channelId_idx" ON "ProductChannelPrice"("channelId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductChannelPrice_productId_channelId_key" ON "ProductChannelPrice"("productId", "channelId");

-- AddForeignKey
ALTER TABLE "ProductChannelPrice" ADD CONSTRAINT "ProductChannelPrice_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductChannelPrice" ADD CONSTRAINT "ProductChannelPrice_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "SalesChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
