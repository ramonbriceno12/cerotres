import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { FeeBase, PrismaClient, SelectionType } from '@prisma/client';

const prisma = new PrismaClient();

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? 'owner@cerotres.com';
const OWNER_PASSWORD = process.env.OWNER_PASSWORD ?? 'ChangeMeNow123!';
const OWNER_NAME = process.env.OWNER_NAME ?? 'Owner Cero Tres';
const PEDIDOS_YA_PERCENT = process.env.PEDIDOS_YA_PERCENT ?? '0.2500';
const PEDIDOS_YA_EFFECTIVE_FROM = process.env.PEDIDOS_YA_EFFECTIVE_FROM ?? '2024-01-01';

async function main() {
  console.log('Seeding Cero Tres…');

  const passwordHash = await hash(OWNER_PASSWORD);

  const owner = await prisma.adminUser.upsert({
    where: { email: OWNER_EMAIL },
    update: { passwordHash, name: OWNER_NAME, role: 'OWNER', isActive: true },
    create: {
      email: OWNER_EMAIL,
      passwordHash,
      name: OWNER_NAME,
      role: 'OWNER',
    },
  });

  const channelDefs = [
    { code: 'DIRECT', name: 'Directo (web)', requiresExternalRef: false, colorHex: '#E0241B' },
    { code: 'WHATSAPP', name: 'WhatsApp', requiresExternalRef: false, colorHex: '#25D366' },
    { code: 'INSTAGRAM', name: 'Instagram', requiresExternalRef: false, colorHex: '#E1306C' },
    { code: 'PHONE', name: 'Teléfono', requiresExternalRef: false, colorHex: '#3B82F6' },
    {
      code: 'PEDIDOS_YA',
      name: 'PedidosYa',
      requiresExternalRef: true,
      colorHex: '#FF1E3C',
    },
    {
      code: 'YUMMY',
      name: 'Yummy',
      requiresExternalRef: true,
      colorHex: '#FF6B00',
    },
  ] as const;

  const channels: Record<string, { id: string }> = {};
  for (const def of channelDefs) {
    channels[def.code] = await prisma.salesChannel.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        requiresExternalRef: def.requiresExternalRef,
        colorHex: def.colorHex,
        isActive: true,
      },
      create: { ...def, isActive: true },
    });
  }

  const pedidosYa = channels.PEDIDOS_YA;
  if (!pedidosYa) {
    throw new Error('PEDIDOS_YA channel missing');
  }

  const existingFee = await prisma.channelFeeRate.findFirst({
    where: {
      channelId: pedidosYa.id,
      effectiveTo: null,
    },
  });

  if (!existingFee) {
    await prisma.channelFeeRate.create({
      data: {
        channelId: pedidosYa.id,
        percent: PEDIDOS_YA_PERCENT,
        fixedFeeCents: 0,
        appliesTo: FeeBase.SUBTOTAL,
        effectiveFrom: new Date(`${PEDIDOS_YA_EFFECTIVE_FROM}T00:00:00.000Z`),
        note: 'Tarifa inicial sembrada (ajustar con el contrato real)',
        createdById: owner.id,
      },
    });
  }

  const yummy = channels.YUMMY;
  if (yummy) {
    const yummyFee = await prisma.channelFeeRate.findFirst({
      where: { channelId: yummy.id, effectiveTo: null },
    });
    if (!yummyFee) {
      await prisma.channelFeeRate.create({
        data: {
          channelId: yummy.id,
          percent: '0.2800',
          fixedFeeCents: 0,
          appliesTo: FeeBase.SUBTOTAL,
          effectiveFrom: new Date(`${PEDIDOS_YA_EFFECTIVE_FROM}T00:00:00.000Z`),
          note: 'Tarifa Yummy de ejemplo (ajustar con contrato real)',
          createdById: owner.id,
        },
      });
    }
  }

  const activeRate = await prisma.exchangeRate.findFirst({
    orderBy: { effectiveFrom: 'desc' },
  });
  if (!activeRate) {
    await prisma.exchangeRate.create({
      data: {
        bolivarsPerUsd: '36.5000',
        effectiveFrom: new Date('2024-01-01T00:00:00.000Z'),
        note: 'Tasa inicial de ejemplo (actualizar diario)',
        createdById: owner.id,
      },
    });
  }

  const zones = [
    { name: 'Centro', feeCents: 150, estimatedMinutes: 35, sortOrder: 1 },
    { name: 'Este', feeCents: 250, estimatedMinutes: 45, sortOrder: 2 },
    { name: 'Oeste', feeCents: 200, estimatedMinutes: 40, sortOrder: 3 },
  ];

  for (const zone of zones) {
    const found = await prisma.deliveryZone.findFirst({
      where: { name: zone.name, deletedAt: null },
    });
    if (found) {
      await prisma.deliveryZone.update({
        where: { id: found.id },
        data: zone,
      });
    } else {
      await prisma.deliveryZone.create({ data: zone });
    }
  }

  const hours = [
    { dayOfWeek: 0, openTime: '12:00', closeTime: '21:00', isClosed: true },
    { dayOfWeek: 1, openTime: '12:00', closeTime: '21:00', isClosed: false },
    { dayOfWeek: 2, openTime: '12:00', closeTime: '21:00', isClosed: false },
    { dayOfWeek: 3, openTime: '12:00', closeTime: '21:00', isClosed: false },
    { dayOfWeek: 4, openTime: '12:00', closeTime: '21:00', isClosed: false },
    { dayOfWeek: 5, openTime: '12:00', closeTime: '22:00', isClosed: false },
    { dayOfWeek: 6, openTime: '12:00', closeTime: '22:00', isClosed: false },
  ];

  for (const h of hours) {
    await prisma.storeHours.upsert({
      where: {
        dayOfWeek_openTime: { dayOfWeek: h.dayOfWeek, openTime: h.openTime },
      },
      update: { closeTime: h.closeTime, isClosed: h.isClosed },
      create: h,
    });
  }

  await prisma.storeSetting.upsert({
    where: { key: 'store.profile' },
    update: {
      value: {
        name: 'Cero Tres',
        instagram: '@03__cerotres',
        currency: 'USD',
        timezone: 'America/Caracas',
      },
    },
    create: {
      key: 'store.profile',
      value: {
        name: 'Cero Tres',
        instagram: '@03__cerotres',
        currency: 'USD',
        timezone: 'America/Caracas',
      },
    },
  });

  // Wipe catalog soft-relations carefully for idempotent seed of menu
  await prisma.recipeItem.deleteMany();
  await prisma.modifierOptionRecipeItem.deleteMany();
  await prisma.productModifierGroup.deleteMany();
  await prisma.modifierOption.deleteMany();
  await prisma.modifierGroup.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();

  const catPepitos = await prisma.category.create({
    data: {
      name: 'Pepitos',
      slug: 'pepitos',
      description: 'Pepitos venezolanos',
      sortOrder: 1,
    },
  });
  const catCombos = await prisma.category.create({
    data: {
      name: 'Combos',
      slug: 'combos',
      description: 'Pepito + papas + bebida',
      sortOrder: 2,
    },
  });
  const catPapas = await prisma.category.create({
    data: {
      name: 'Papas',
      slug: 'papas',
      sortOrder: 3,
    },
  });
  const catBebidas = await prisma.category.create({
    data: {
      name: 'Bebidas',
      slug: 'bebidas',
      sortOrder: 4,
    },
  });

  const extras = await prisma.modifierGroup.create({
    data: {
      name: 'Extras',
      description: 'Agregados para pepitos y papas',
      selectionType: SelectionType.MULTI,
      minSelect: 0,
      maxSelect: null,
      freeQuantity: 0,
      maxQtyPerOption: 1,
      sortOrder: 1,
      options: {
        create: [
          {
            name: 'Gratinado',
            description: 'Mezcla de queso mozzarella y pecorino gratinados',
            priceDelta: 150,
            sortOrder: 1,
          },
          {
            name: 'Tocineta Crispy',
            priceDelta: 150,
            sortOrder: 2,
          },
          {
            name: 'Vegetales Grillados',
            description: 'Pimentón y cebolla grillados',
            priceDelta: 150,
            sortOrder: 3,
          },
        ],
      },
    },
    include: { options: true },
  });

  const classicSauces = await prisma.modifierGroup.create({
    data: {
      name: 'Salsas clásicas',
      selectionType: SelectionType.MULTI,
      minSelect: 0,
      maxSelect: null,
      freeQuantity: 0,
      maxQtyPerOption: 3,
      sortOrder: 2,
      options: {
        create: [
          { name: 'Mayonesa', priceDelta: 25, sortOrder: 1 },
          { name: 'Ketchup', priceDelta: 25, sortOrder: 2 },
          { name: 'Salsa de Maíz', priceDelta: 25, sortOrder: 3 },
          { name: 'BBQ', priceDelta: 25, sortOrder: 4 },
        ],
      },
    },
  });

  const houseSauces = await prisma.modifierGroup.create({
    data: {
      name: 'Salsas de la casa',
      selectionType: SelectionType.MULTI,
      minSelect: 0,
      maxSelect: null,
      freeQuantity: 0,
      maxQtyPerOption: 3,
      sortOrder: 3,
      options: {
        create: [
          {
            name: 'Mayopesto',
            description: 'Cremosa base de la casa con pesto artesanal de albahaca y ajo',
            priceDelta: 50,
            sortOrder: 1,
          },
          {
            name: 'Maíz y Tocineta',
            description: 'Salsa de maíz con el toque ahumado de la tocineta dorada',
            priceDelta: 50,
            sortOrder: 2,
          },
          {
            name: 'Mayocurry',
            description: 'Mayonesa con notas aromáticas y especiadas de curry',
            priceDelta: 50,
            sortOrder: 3,
          },
        ],
      },
    },
  });

  type Link = {
    groupId: string;
    sortOrder: number;
    freeQuantityOverride?: number;
    minSelectOverride?: number;
    maxSelectOverride?: number;
  };

  async function createProduct(data: {
    categoryId: string;
    name: string;
    slug: string;
    description?: string;
    priceCents: number;
    sortOrder: number;
    links: Link[];
  }) {
    return prisma.product.create({
      data: {
        categoryId: data.categoryId,
        name: data.name,
        slug: data.slug,
        description: data.description,
        priceCents: data.priceCents,
        sortOrder: data.sortOrder,
        modifierGroups: {
          create: data.links.map((link) => ({
            groupId: link.groupId,
            sortOrder: link.sortOrder,
            freeQuantityOverride: link.freeQuantityOverride ?? null,
            minSelectOverride: link.minSelectOverride ?? null,
            maxSelectOverride: link.maxSelectOverride ?? null,
          })),
        },
      },
    });
  }

  const pepitoLinks: Link[] = [
    { groupId: extras.id, sortOrder: 1, freeQuantityOverride: 2 },
    { groupId: classicSauces.id, sortOrder: 2, freeQuantityOverride: 2 },
    { groupId: houseSauces.id, sortOrder: 3, freeQuantityOverride: 0 },
  ];

  const comboLinks: Link[] = [
    { groupId: extras.id, sortOrder: 1, freeQuantityOverride: 3 },
    { groupId: classicSauces.id, sortOrder: 2, freeQuantityOverride: 2 },
    { groupId: houseSauces.id, sortOrder: 3, freeQuantityOverride: 2 },
  ];

  const papasLinks: Link[] = [
    { groupId: extras.id, sortOrder: 1, freeQuantityOverride: 0 },
    { groupId: classicSauces.id, sortOrder: 2, freeQuantityOverride: 1 },
  ];

  await createProduct({
    categoryId: catPepitos.id,
    name: 'Pepito de Lomito',
    slug: 'pepito-lomito',
    description: '200 gr de lomito, pan canilla de 20–22 cm',
    priceCents: 650,
    sortOrder: 1,
    links: pepitoLinks,
  });
  await createProduct({
    categoryId: catPepitos.id,
    name: 'Pepito de Pollo',
    slug: 'pepito-pollo',
    description: '200 gr de pollo, pan canilla de 20–22 cm',
    priceCents: 650,
    sortOrder: 2,
    links: pepitoLinks,
  });
  await createProduct({
    categoryId: catPepitos.id,
    name: 'Pepito Mixto',
    slug: 'pepito-mixto',
    description: '100 gr de lomito + 100 gr de pollo, pan canilla de 20–22 cm',
    priceCents: 650,
    sortOrder: 3,
    links: pepitoLinks,
  });

  await createProduct({
    categoryId: catCombos.id,
    name: 'Combo Clásico',
    slug: 'combo-clasico',
    description: 'Pepito de Lomito + 175 gr papas + bebida + extras y salsas incluidos',
    priceCents: 799,
    sortOrder: 1,
    links: comboLinks,
  });
  await createProduct({
    categoryId: catCombos.id,
    name: 'Combo Clásico de Pollo',
    slug: 'combo-clasico-pollo',
    description: 'Pepito de Pollo + 175 gr papas + bebida + extras y salsas incluidos',
    priceCents: 799,
    sortOrder: 2,
    links: comboLinks,
  });
  await createProduct({
    categoryId: catCombos.id,
    name: 'Combo Cerotres',
    slug: 'combo-cerotres',
    description: 'Pepito Mixto + 175 gr papas + bebida + extras y salsas incluidos',
    priceCents: 799,
    sortOrder: 3,
    links: comboLinks,
  });

  await createProduct({
    categoryId: catPapas.id,
    name: 'Papas fritas',
    slug: 'papas-fritas',
    description: '175 gr, sal y una salsa clásica',
    priceCents: 200,
    sortOrder: 1,
    links: papasLinks,
  });
  await createProduct({
    categoryId: catPapas.id,
    name: 'Papas fritas con ajo',
    slug: 'papas-fritas-ajo',
    description: '175 gr, sal, ajo en polvo y una salsa clásica',
    priceCents: 250,
    sortOrder: 2,
    links: papasLinks,
  });

  await createProduct({
    categoryId: catBebidas.id,
    name: 'Agua Mineral (330 ml)',
    slug: 'agua-mineral',
    priceCents: 150,
    sortOrder: 1,
    links: [],
  });
  await createProduct({
    categoryId: catBebidas.id,
    name: 'Refresco en Lata',
    slug: 'refresco-lata',
    priceCents: 250,
    sortOrder: 2,
    links: [],
  });

  // Sample inventory + recipes so finance screens are not empty
  const unitSeeds = [
    { code: 'kg', name: 'Kilogramo', dimension: 'MASS' as const, toCanonical: 1, sortOrder: 1 },
    { code: 'g', name: 'Gramo', dimension: 'MASS' as const, toCanonical: 0.001, sortOrder: 2 },
    { code: 'l', name: 'Litro', dimension: 'VOLUME' as const, toCanonical: 1, sortOrder: 3 },
    {
      code: 'ml',
      name: 'Mililitro',
      dimension: 'VOLUME' as const,
      toCanonical: 0.001,
      sortOrder: 4,
    },
    { code: 'und', name: 'Unidad', dimension: 'COUNT' as const, toCanonical: 1, sortOrder: 5 },
  ];
  for (const u of unitSeeds) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: {
        name: u.name,
        dimension: u.dimension,
        toCanonical: u.toCanonical,
        sortOrder: u.sortOrder,
        isActive: true,
      },
      create: u,
    });
  }

  await prisma.supplier.upsert({
    where: { id: 'seed-supplier-carniceria' },
    update: {
      name: 'Carnicería Central',
      phone: '+58 412 0000000',
      isActive: true,
      deletedAt: null,
    },
    create: {
      id: 'seed-supplier-carniceria',
      name: 'Carnicería Central',
      phone: '+58 412 0000000',
      notes: 'Proveedor de ejemplo (seed)',
    },
  });

  const ingredientDefs = [
    { code: 'CARNE-LOM', name: 'Carne de lomito', unit: 'kg', avgCostCents: 670, stock: 5, min: 1 },
    { code: 'CARNE-POL', name: 'Pollo', unit: 'kg', avgCostCents: 420, stock: 5, min: 1 },
    { code: 'PAN-CAN', name: 'Pan canilla', unit: 'und', avgCostCents: 40, stock: 40, min: 10 },
    {
      code: 'QUESO-MOZ',
      name: 'Queso mozzarella',
      unit: 'kg',
      avgCostCents: 550,
      stock: 2,
      min: 0.5,
    },
    {
      code: 'QUESO-PEC',
      name: 'Queso pecorino',
      unit: 'kg',
      avgCostCents: 900,
      stock: 0.5,
      min: 0.1,
    },
    { code: 'TOCINETA', name: 'Tocineta', unit: 'kg', avgCostCents: 800, stock: 1.5, min: 0.3 },
    { code: 'PIMENTON', name: 'Pimentón', unit: 'kg', avgCostCents: 200, stock: 2, min: 0.3 },
    { code: 'CEBOLLA', name: 'Cebolla', unit: 'kg', avgCostCents: 80, stock: 3, min: 0.5 },
    { code: 'MAYO', name: 'Mayonesa', unit: 'kg', avgCostCents: 300, stock: 1, min: 0.2 },
    { code: 'KETCHUP', name: 'Ketchup', unit: 'kg', avgCostCents: 250, stock: 1, min: 0.2 },
    {
      code: 'SALSA-MAIZ',
      name: 'Salsa de maíz',
      unit: 'kg',
      avgCostCents: 280,
      stock: 0.8,
      min: 0.2,
    },
    { code: 'BBQ', name: 'Salsa BBQ', unit: 'kg', avgCostCents: 320, stock: 0.8, min: 0.2 },
    { code: 'PESTO', name: 'Pesto', unit: 'kg', avgCostCents: 600, stock: 0.4, min: 0.1 },
    { code: 'CURRY', name: 'Curry en polvo', unit: 'kg', avgCostCents: 400, stock: 0.2, min: 0.05 },
    { code: 'PAPA', name: 'Papa', unit: 'kg', avgCostCents: 120, stock: 10, min: 2 },
    { code: 'ACEITE', name: 'Aceite', unit: 'l', avgCostCents: 250, stock: 3, min: 1 },
  ] as const;

  const ingredientsByCode: Record<string, string> = {};
  for (const def of ingredientDefs) {
    const row = await prisma.ingredient.upsert({
      where: { code: def.code },
      update: {
        name: def.name,
        unit: def.unit,
        avgCostCents: def.avgCostCents,
        lastCostCents: def.avgCostCents,
        costPerUnitCents: def.avgCostCents,
        stockQuantity: def.stock,
        minStockQuantity: def.min,
        isActive: true,
        deletedAt: null,
      },
      create: {
        code: def.code,
        name: def.name,
        unit: def.unit,
        avgCostCents: def.avgCostCents,
        lastCostCents: def.avgCostCents,
        costPerUnitCents: def.avgCostCents,
        stockQuantity: def.stock,
        minStockQuantity: def.min,
      },
    });
    ingredientsByCode[def.code] = row.id;
  }

  async function seedRecipe(
    slug: string,
    lines: Array<{ code: keyof typeof ingredientsByCode | string; quantity: number }>,
  ) {
    const product = await prisma.product.findFirst({ where: { slug, deletedAt: null } });
    if (!product) return;
    await prisma.recipeItem.deleteMany({ where: { productId: product.id } });
    for (const line of lines) {
      const ingredientId = ingredientsByCode[line.code];
      if (!ingredientId) continue;
      await prisma.recipeItem.create({
        data: {
          productId: product.id,
          ingredientId,
          quantity: line.quantity,
        },
      });
    }
  }

  // Hand check: 0.18kg×670 + 1×40 = 121+40 = 161¢ on $6.50 → food cost ~24.8%
  await seedRecipe('pepito-lomito', [
    { code: 'CARNE-LOM', quantity: 0.18 },
    { code: 'PAN-CAN', quantity: 1 },
    { code: 'QUESO-MOZ', quantity: 0.03 },
  ]);
  await seedRecipe('pepito-pollo', [
    { code: 'CARNE-POL', quantity: 0.18 },
    { code: 'PAN-CAN', quantity: 1 },
    { code: 'QUESO-MOZ', quantity: 0.03 },
  ]);
  await seedRecipe('pepito-mixto', [
    { code: 'CARNE-LOM', quantity: 0.09 },
    { code: 'CARNE-POL', quantity: 0.09 },
    { code: 'PAN-CAN', quantity: 1 },
    { code: 'QUESO-MOZ', quantity: 0.03 },
  ]);
  await seedRecipe('papas-fritas', [
    { code: 'PAPA', quantity: 0.175 },
    { code: 'ACEITE', quantity: 0.02 },
  ]);
  await seedRecipe('papas-fritas-ajo', [
    { code: 'PAPA', quantity: 0.175 },
    { code: 'ACEITE', quantity: 0.02 },
  ]);

  async function seedModifierRecipe(
    optionName: string,
    lines: Array<{ code: string; quantity: number }>,
  ) {
    const option = await prisma.modifierOption.findFirst({
      where: { name: optionName, deletedAt: null },
    });
    if (!option) return;
    await prisma.modifierOptionRecipeItem.deleteMany({
      where: { modifierOptionId: option.id },
    });
    for (const line of lines) {
      const ingredientId = ingredientsByCode[line.code];
      if (!ingredientId) continue;
      await prisma.modifierOptionRecipeItem.create({
        data: {
          modifierOptionId: option.id,
          ingredientId,
          quantity: line.quantity,
        },
      });
    }
  }

  await seedModifierRecipe('Gratinado', [
    { code: 'QUESO-MOZ', quantity: 0.04 },
    { code: 'QUESO-PEC', quantity: 0.01 },
  ]);
  await seedModifierRecipe('Tocineta Crispy', [{ code: 'TOCINETA', quantity: 0.03 }]);
  await seedModifierRecipe('Vegetales Grillados', [
    { code: 'PIMENTON', quantity: 0.04 },
    { code: 'CEBOLLA', quantity: 0.03 },
  ]);
  await seedModifierRecipe('Mayonesa', [{ code: 'MAYO', quantity: 0.02 }]);
  await seedModifierRecipe('Ketchup', [{ code: 'KETCHUP', quantity: 0.02 }]);
  await seedModifierRecipe('Salsa de Maíz', [{ code: 'SALSA-MAIZ', quantity: 0.025 }]);
  await seedModifierRecipe('BBQ', [{ code: 'BBQ', quantity: 0.025 }]);
  await seedModifierRecipe('Mayopesto', [
    { code: 'MAYO', quantity: 0.02 },
    { code: 'PESTO', quantity: 0.01 },
  ]);
  await seedModifierRecipe('Maíz y Tocineta', [
    { code: 'SALSA-MAIZ', quantity: 0.02 },
    { code: 'TOCINETA', quantity: 0.01 },
  ]);
  await seedModifierRecipe('Mayocurry', [
    { code: 'MAYO', quantity: 0.02 },
    { code: 'CURRY', quantity: 0.002 },
  ]);

  const productCount = await prisma.product.count();
  console.log(`Seed OK: ${productCount} products, owner=${owner.email}`);
  console.log(
    `PedidosYa fee: ${(Number(PEDIDOS_YA_PERCENT) * 100).toFixed(2)}% from ${PEDIDOS_YA_EFFECTIVE_FROM}`,
  );
  console.log(`Extras group id: ${extras.id} (${extras.options.length} options)`);
  console.log(
    `Finance seed: ${ingredientDefs.length} ingredients + sample recipes + modifier recipes`,
  );
}
main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
