import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemFavorite } from './entities/item-favorite.entity';
import { Item } from 'src/item/entities/item.entity';

@Injectable()
export class FavoriteService {
  constructor(
    @InjectRepository(ItemFavorite)
    private readonly favoriteRepository: Repository<ItemFavorite>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
  ) {}

  /**
   * Alternar favorito de forma atómica e idempotente.
   */
  async toggleFavorite(
    userId: string,
    itemId: string,
  ): Promise<{ isFavorite: boolean; favoritesCount: number }> {
    const item = await this.itemRepository.findOne({ where: { id: itemId } });
    if (!item) {
      throw new NotFoundException(`Artículo con id "${itemId}" no encontrado`);
    }

    const existingFavorite = await this.favoriteRepository.findOne({
      where: { userId, itemId },
    });

    if (existingFavorite) {
      // Eliminar favorito
      await this.favoriteRepository.delete({ id: existingFavorite.id });

      // Decrementar favoritesCount asegurando que nunca sea menor a 0
      await this.itemRepository
        .createQueryBuilder()
        .update(Item)
        .set({
          favoritesCount: () => 'GREATEST(0, "favoritesCount" - 1)',
        })
        .where('id = :id', { id: itemId })
        .execute();

      const updated = await this.itemRepository.findOne({
        where: { id: itemId },
        select: ['favoritesCount'],
      });

      return {
        isFavorite: false,
        favoritesCount: updated?.favoritesCount ?? 0,
      };
    } else {
      // Precio efectivo al momento de guardar
      const hasValidDiscount =
        item.discountPrice != null &&
        Number(item.discountPrice) > 0 &&
        Number(item.discountPrice) < Number(item.price);
      const currentPrice = hasValidDiscount
        ? Number(item.discountPrice)
        : Number(item.price);

      const newFavorite = this.favoriteRepository.create({
        userId,
        itemId,
        priceWhenAdded: currentPrice,
      });

      await this.favoriteRepository.save(newFavorite);

      // Incrementar favoritesCount
      await this.itemRepository
        .createQueryBuilder()
        .update(Item)
        .set({
          favoritesCount: () => '"favoritesCount" + 1',
        })
        .where('id = :id', { id: itemId })
        .execute();

      const updated = await this.itemRepository.findOne({
        where: { id: itemId },
        select: ['favoritesCount'],
      });

      return {
        isFavorite: true,
        favoritesCount: updated?.favoritesCount ?? 1,
      };
    }
  }

  /**
   * Obtener favoritos del usuario con datos frescos y cálculo delta de precio.
   */
  async getUserFavorites(userId: string): Promise<any[]> {
    const favorites = await this.favoriteRepository
      .createQueryBuilder('fav')
      .innerJoinAndSelect('fav.item', 'item')
      .leftJoinAndSelect('item.store', 'store')
      .leftJoinAndSelect('item.category', 'category')
      .leftJoinAndSelect('item.variants', 'variants')
      .where('fav.userId = :userId', { userId })
      .andWhere('item.isDeleted = false')
      .orderBy('fav.createdAt', 'DESC')
      .getMany();

    return favorites.map((fav) => {
      const item = fav.item;
      const hasValidDiscount =
        item.discountPrice != null &&
        Number(item.discountPrice) > 0 &&
        Number(item.discountPrice) < Number(item.price);
      const currentPrice = hasValidDiscount
        ? Number(item.discountPrice)
        : Number(item.price);

      const priceWhenAdded = Number(fav.priceWhenAdded);
      const priceDropped = currentPrice < priceWhenAdded;
      const priceDifference = priceDropped
        ? Math.round((priceWhenAdded - currentPrice) * 100) / 100
        : 0;

      let inStock = !item.trackInventory;
      if (item.trackInventory) {
        if (item.hasVariants) {
          const variants = Array.isArray(item.variants) ? item.variants : [];
          const activeVariants = variants.filter((v) => v.isActive);
          inStock =
            activeVariants.length > 0 &&
            activeVariants.some((v) => Number(v.stockQuantity ?? 0) > 0);
        } else {
          inStock =
            item.stockQuantity != null && Number(item.stockQuantity) > 0;
        }
      }

      const storeStatus = item.store?.status
        ? String(item.store.status).toUpperCase()
        : null;
      const isStoreSuspended = storeStatus === 'SUSPENDED';
      const isStoreInactive =
        storeStatus === 'INACTIVE' || storeStatus === 'CLOSED';
      const isItemActive = item.isActive ?? true;
      const isItemDeleted = Boolean(item.isDeleted);
      const canPurchase =
        !isStoreSuspended &&
        !isStoreInactive &&
        isItemActive &&
        !isItemDeleted &&
        inStock;

      return {
        id: fav.id,
        itemId: item.id,
        priceWhenAdded,
        currentPrice,
        priceDropped,
        priceDifference,
        inStock,
        isStoreSuspended,
        isStoreInactive,
        canPurchase,
        createdAt: fav.createdAt,
        item: {
          ...item,
          price: Number(item.price),
          discountPrice:
            item.discountPrice != null ? Number(item.discountPrice) : null,
          stockQuantity:
            item.stockQuantity != null ? Number(item.stockQuantity) : null,
          averageRating: Number(item.averageRating || 0),
          favoritesCount: Number(item.favoritesCount || 0),
        },
      };
    });
  }

  /**
   * Lista de IDs de artículos en favoritos del usuario.
   */
  async getUserFavoriteItemIds(userId: string): Promise<string[]> {
    const favorites = await this.favoriteRepository.find({
      where: { userId },
      select: ['itemId'],
    });
    return favorites.map((f) => f.itemId);
  }

  /**
   * Verificar si un artículo en específico está en favoritos del usuario.
   */
  async isItemFavorite(userId: string, itemId: string): Promise<boolean> {
    const count = await this.favoriteRepository.count({
      where: { userId, itemId },
    });
    return count > 0;
  }
}
