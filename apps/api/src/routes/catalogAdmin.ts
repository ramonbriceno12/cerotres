import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { AppError } from '../lib/errors.js';
import { requireAuth, requireRoles } from '../middleware/auth.js';
import { storage } from '../services/storage.js';
import {
  productChannelPricesInclude,
  syncProductChannelPrices,
  toChannelPriceDtos,
} from '../services/channelPrices.js';
import multer from 'multer';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

function paramId(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value[0]) return value[0];
  throw new AppError(400, 'VALIDATION_ERROR', 'Missing id');
}

const productUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  priceCents: z.number().int().nonnegative().optional(),
  categoryId: z.string().min(1).optional(),
  isAvailable: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  imageKey: z.string().nullable().optional(),
  channelPrices: z
    .array(
      z.object({
        channelId: z.string().min(1),
        priceCents: z.number().int().nonnegative().nullable(),
      }),
    )
    .optional(),
});

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

const productModifiersInclude = {
  modifierGroups: {
    include: { group: { include: { options: { where: { deletedAt: null } } } } },
    orderBy: { sortOrder: 'asc' as const },
  },
  ...productChannelPricesInclude,
};

function serializeAdminProduct<
  T extends { imageKey: string | null; channelPrices: Parameters<typeof toChannelPriceDtos>[0] },
>(product: T) {
  const { channelPrices, ...rest } = product;
  return {
    ...rest,
    imageUrl: product.imageKey ? storage.getPublicUrl(product.imageKey) : null,
    channelPrices: toChannelPriceDtos(channelPrices),
  };
}

export const catalogAdminRouter = Router();
catalogAdminRouter.use(requireAuth, requireRoles('OWNER', 'MANAGER'));

catalogAdminRouter.get('/categories', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: productModifiersInclude,
        },
      },
    });
    res.json({
      categories: categories.map((category) => ({
        ...category,
        products: category.products.map((product) => serializeAdminProduct(product)),
      })),
    });
  } catch (error) {
    next(error);
  }
});

catalogAdminRouter.get('/products', async (_req, res, next) => {
  try {
    const products = await prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        category: true,
        ...productModifiersInclude,
      },
    });
    res.json({
      products: products.map((product) => serializeAdminProduct(product)),
    });
  } catch (error) {
    next(error);
  }
});

catalogAdminRouter.patch('/products/:id', async (req, res, next) => {
  try {
    const body = productUpdateSchema.parse(req.body);
    const existing = await prisma.product.findFirst({
      where: { id: paramId(req.params.id), deletedAt: null },
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Product not found');

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.priceCents !== undefined ? { priceCents: body.priceCents } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.imageKey !== undefined ? { imageKey: body.imageKey } : {}),
      },
      include: { category: true, ...productChannelPricesInclude },
    });

    let channelPrices = toChannelPriceDtos(product.channelPrices);
    if (body.channelPrices) {
      if (!req.admin) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
      const userAgent = req.get('user-agent');
      channelPrices = await syncProductChannelPrices({
        productId: product.id,
        prices: body.channelPrices,
        actorId: req.admin.id,
        ...(req.ip ? { ip: req.ip } : {}),
        ...(userAgent ? { userAgent } : {}),
      });
    }

    res.json({
      product: {
        ...product,
        imageUrl: product.imageKey ? storage.getPublicUrl(product.imageKey) : null,
        channelPrices,
      },
    });
  } catch (error) {
    next(error);
  }
});

catalogAdminRouter.post('/products/:id/86', async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: paramId(req.params.id), deletedAt: null },
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Product not found');

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { isAvailable: !existing.isAvailable },
    });

    res.json({
      product: {
        id: product.id,
        isAvailable: product.isAvailable,
      },
    });
  } catch (error) {
    next(error);
  }
});

catalogAdminRouter.post('/products/reorder', async (req, res, next) => {
  try {
    const body = reorderSchema.parse(req.body);
    await prisma.$transaction(
      body.orderedIds.map((id, index) =>
        prisma.product.update({
          where: { id },
          data: { sortOrder: index + 1 },
        }),
      ),
    );
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

catalogAdminRouter.post('/products/:id/image', upload.single('file'), async (req, res, next) => {
  try {
    const existing = await prisma.product.findFirst({
      where: { id: paramId(req.params.id), deletedAt: null },
    });
    if (!existing) throw new AppError(404, 'NOT_FOUND', 'Product not found');
    if (!req.file) throw new AppError(400, 'VALIDATION_ERROR', 'Image file required');

    const stored = await storage.putObject({
      buffer: req.file.buffer,
      contentType: req.file.mimetype,
      folder: 'products',
    });

    if (existing.imageKey) {
      await storage.deleteObject(existing.imageKey);
    }

    const product = await prisma.product.update({
      where: { id: existing.id },
      data: { imageKey: stored.key },
    });

    res.json({
      product: {
        id: product.id,
        imageKey: product.imageKey,
        imageUrl: storage.getPublicUrl(stored.key),
      },
    });
  } catch (error) {
    next(error);
  }
});

catalogAdminRouter.get('/modifier-groups', async (_req, res, next) => {
  try {
    const groups = await prisma.modifierGroup.findMany({
      where: { deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        options: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
        },
      },
    });
    res.json({ groups });
  } catch (error) {
    next(error);
  }
});
