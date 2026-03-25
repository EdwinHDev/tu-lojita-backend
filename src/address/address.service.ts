import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { Address } from './entities/address.entity';
import { Repository } from 'typeorm';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class AddressService {

  constructor(
    @InjectRepository(Address)
    private readonly addressRepository: Repository<Address>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async create(createAddressDto: CreateAddressDto, userId: string) {
    const existUser = await this.userRepository.findOneBy({ id: userId });
    if (!existUser) {
      throw new NotFoundException('No se encontró el usuario');
    }

    // 1. Apagamos TODAS las direcciones anteriores de este usuario
    await this.addressRepository.update(
      { user: { id: userId } },
      { isActive: false }
    );

    // 2. Creamos la nueva asegurándonos que sea la activa
    const address = this.addressRepository.create({
      ...createAddressDto,
      isActive: true, // Forzamos a true
      user: existUser
    });

    const newAddress = await this.addressRepository.save(address);
    const { user, ...rest } = newAddress;
    return rest;
  }

  async findAll(userId: string) {
    return this.addressRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: 'DESC' } // Mostramos las más recientes primero
    });
  }

  async findOne(id: string, userId: string) {
    // Verificamos por id y por el userId para evitar que vean direcciones de otros
    const address = await this.addressRepository.findOne({
      where: { id, user: { id: userId } }
    });

    if (!address) {
      throw new NotFoundException('No se encontró la dirección o no tienes permisos');
    }
    return address;
  }

  async update(id: string, updateAddressDto: UpdateAddressDto, userId: string) {
    // 1. Validamos que la dirección exista y sea del usuario
    await this.findOne(id, userId);

    // 2. Si el usuario mandó explícitamente isActive en true, apagamos las demás
    if (updateAddressDto.isActive === true) {
      await this.addressRepository.update(
        { user: { id: userId } },
        { isActive: false }
      );
    }

    // 3. Actualizamos la dirección solicitada
    await this.addressRepository.update(id, updateAddressDto);
    return this.findOne(id, userId); // Retornamos la dirección actualizada
  }

  async remove(id: string, userId: string) {
    // 1. Buscamos la dirección a borrar
    const address = await this.findOne(id, userId);

    // Guardamos el estado antes de borrarla
    const wasActive = address.isActive;

    // 2. La eliminamos
    await this.addressRepository.remove(address);

    // 3. LÓGICA DE SALVAMENTO: Si era la activa, activamos la más reciente que quede
    if (wasActive) {
      const remainingAddress = await this.addressRepository.findOne({
        where: { user: { id: userId } },
        order: { createdAt: 'DESC' } // Toma la última que haya creado
      });

      if (remainingAddress) {
        remainingAddress.isActive = true;
        await this.addressRepository.save(remainingAddress);
      }
    }

    return { message: 'Dirección eliminada exitosamente' };
  }
}
