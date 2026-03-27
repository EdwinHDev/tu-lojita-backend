import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Item } from './entities/item.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreCategory } from 'src/store-category/entities/store-category.entity';

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(StoreCategory)
    private readonly storeCategoryRepository: Repository<StoreCategory>,
  ) {}

  async create(createItemDto: CreateItemDto, user: User) {
    const { storeId, categoryId, ...itemData } = createItemDto;

    const store = await this.storeRepository.findOne({
      where: { id: storeId },
      relations: ['owner']
    });

    if (!store) {
      throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    if (store.owner?.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para agregar productos a esta tienda');
    }

    let category: StoreCategory | undefined;
    if (categoryId) {
      category = await this.storeCategoryRepository.findOne({
        where: { id: categoryId, store: { id: storeId } }
      }) ?? undefined;

      if (!category) {
        throw new NotFoundException(`Categoría con ID ${categoryId} no encontrada en esta tienda`);
      }
    }

    const item = this.itemRepository.create({
      ...itemData,
      store,
      category
    });

    return await this.itemRepository.save(item);
  }

  async findAll() {
    return await this.itemRepository.find({
      relations: ['store', 'category']
    });
  }

  async findByStore(storeId: string) {
    return await this.itemRepository.find({
      where: { store: { id: storeId } },
      relations: ['category']
    });
  }

  async findOne(id: string) {
    const item = await this.itemRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner', 'category']
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${id} no encontrado`);
    }
    return item;
  }

  async update(id: string, updateItemDto: UpdateItemDto, user: User) {
    const item = await this.findOne(id);

    if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para actualizar este producto');
    }

    this.itemRepository.merge(item, updateItemDto);
    return await this.itemRepository.save(item);
  }

  async remove(id: string, user: User) {
    const item = await this.findOne(id);

    if (item.store.owner?.id !== user.id) {
      throw new ForbiddenException('No tienes permiso para eliminar este producto');
    }

    await this.itemRepository.remove(item);
    return { deleted: true };
  }
}
