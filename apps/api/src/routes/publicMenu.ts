import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { storage } from '../services/storage.js';

export const publicMenuRouter = Router();

publicMenuRouter.get('/menu', async (_req, res, next) => {
  try {
    const categories = await prisma.category.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        products: {
          where: {
            deletedAt: null,
            isActive: true,
            isAvailable: true,
          },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
          include: {
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              include: {
                group: {
                  include: {
                    options: {
                      where: { deletedAt: null, isAvailable: true },
                      orderBy: { sortOrder: 'asc' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    res.json({
      categories: categories
        .filter((category) => category.products.length > 0)
        .map((category) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          description: category.description,
          products: category.products.map((product) => ({
            id: product.id,
            name: product.name,
            slug: product.slug,
            description: product.description,
            priceCents: product.priceCents,
            imageUrl: product.imageKey ? storage.getPublicUrl(product.imageKey) : null,
            modifierGroups: product.modifierGroups.map((link) => ({
              id: link.group.id,
              name: link.group.name,
              description: link.group.description,
              selectionType: link.group.selectionType,
              minSelect: link.minSelectOverride ?? link.group.minSelect,
              maxSelect: link.maxSelectOverride ?? link.group.maxSelect,
              freeQuantity: link.freeQuantityOverride ?? link.group.freeQuantity,
              freeStrategy: link.group.freeStrategy,
              maxQtyPerOption: link.group.maxQtyPerOption,
              options: link.group.options.map((option) => ({
                id: option.id,
                name: option.name,
                description: option.description,
                priceDelta: option.priceDelta,
              })),
            })),
          })),
        })),
    });
  } catch (error) {
    next(error);
  }
});
