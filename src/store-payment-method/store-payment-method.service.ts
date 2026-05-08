import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StorePaymentMethod } from './entities/store-payment-method.entity';
import { CreateStorePaymentMethodDto, UpdateStorePaymentMethodDto } from './dto/create-store-payment-method.dto';
import { Store } from 'src/store/entities/store.entity';
import { Bank } from 'src/bank/entities/bank.entity';

@Injectable()
export class StorePaymentMethodService {
  constructor(
    @InjectRepository(StorePaymentMethod)
    private readonly paymentMethodRepository: Repository<StorePaymentMethod>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
  ) {}

  async create(createDto: CreateStorePaymentMethodDto, storeOwnerId: string) {
    const { bankId, storeId, ...data } = createDto;

    const store = await this.storeRepository.findOne({
      where: { id: storeId, owner: { id: storeOwnerId } },
    });

    if (!store) {
      throw new NotFoundException('No se encontró la tienda o no tienes permisos sobre ella');
    }

    let bank: Bank | null = null;
    if (bankId) {
      bank = await this.bankRepository.findOneBy({ id: bankId });
      if (!bank) throw new NotFoundException(`Banco con ID ${bankId} no encontrado`);
    }

    const paymentMethod = this.paymentMethodRepository.create({
      ...data,
      store,
      bank: bank || undefined,
    });

    return await this.paymentMethodRepository.save(paymentMethod);
  }

  async findAllByStore(storeId: string) {
    return await this.paymentMethodRepository.find({
      where: { store: { id: storeId }, isActive: true },
    });
  }

  async findMyStoreMethods(storeOwnerId: string) {
    return await this.paymentMethodRepository.find({
      where: { store: { owner: { id: storeOwnerId } } },
      relations: ['bank'],
    });
  }

  async findStoreMethodsForManagement(storeId: string, storeOwnerId: string) {
    return await this.paymentMethodRepository.find({
      where: { 
        store: { id: storeId, owner: { id: storeOwnerId } } 
      },
      relations: ['bank'],
    });
  }

  async update(id: string, updateDto: UpdateStorePaymentMethodDto, storeOwnerId: string) {
    const { bankId, ...data } = updateDto;
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner'],
    });

    if (!paymentMethod) throw new NotFoundException('Método de pago no encontrado');
    if (paymentMethod.store.owner?.id !== storeOwnerId) {
      throw new ForbiddenException('No tienes permiso para editar este método de pago');
    }

    if (bankId) {
      const bank = await this.bankRepository.findOneBy({ id: bankId });
      if (!bank) throw new NotFoundException(`Banco con ID ${bankId} no encontrado`);
      paymentMethod.bank = bank;
    }

    Object.assign(paymentMethod, data);
    return await this.paymentMethodRepository.save(paymentMethod);
  }

  async remove(id: string, storeOwnerId: string) {
    const paymentMethod = await this.paymentMethodRepository.findOne({
      where: { id },
      relations: ['store', 'store.owner'],
    });

    if (!paymentMethod) throw new NotFoundException('Método de pago no encontrado');
    if (paymentMethod.store.owner?.id !== storeOwnerId) {
      throw new ForbiddenException('No tienes permiso para eliminar este método de pago');
    }

    await this.paymentMethodRepository.remove(paymentMethod);
    return { deleted: true };
  }
}
