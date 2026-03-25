import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';

@Injectable()
export class UserService {

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) { }

  async create(createUserDto: CreateUserDto) {
    const { companyId, storeId, ...userDetails } = createUserDto;

    let company: Company | undefined;
    if (companyId) {
      company = await this.companyRepository.findOneBy({ id: companyId }) ?? undefined;
      if (!company) throw new NotFoundException(`Empresa con ID ${companyId} no encontrada`);
    }

    let store: Store | undefined;
    if (storeId) {
      store = await this.storeRepository.findOneBy({ id: storeId }) ?? undefined;
      if (!store) throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    const user = this.userRepository.create({
      ...userDetails,
      company,
      store,
    });

    return await this.userRepository.save(user);
  }

  findAll() {
    return this.userRepository.find({
      relations: ['addresses', 'company', 'store']
    });
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['addresses', 'company', 'store']
    });

    if (!user) throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { companyId, storeId, ...updateDetails } = updateUserDto;
    const user = await this.findOne(id);

    if (companyId !== undefined) {
      if (companyId) {
        const company = await this.companyRepository.findOneBy({ id: companyId }) ?? undefined;
        if (!company) throw new NotFoundException(`Empresa con ID ${companyId} no encontrada`);
        user.company = company;
      } else {
        user.company = undefined;
      }
    }

    if (storeId !== undefined) {
      if (storeId) {
        const store = await this.storeRepository.findOneBy({ id: storeId }) ?? undefined;
        if (!store) throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
        user.store = store;
      } else {
        user.store = undefined;
      }
    }

    this.userRepository.merge(user, updateDetails);
    return await this.userRepository.save(user);
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
    return { deleted: true };
  }

  async checkHasStore(userId: string) {
    if (!await this.userRepository.findOneBy({ id: userId })) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      select: ['id', 'name'],
    });

    return {
      hasStore: !!store,
      storeId: store?.id || null,
      storeName: store?.name || null,
    };
  }

  async checkHasCompany(userId: string) {
    if (!await this.userRepository.findOneBy({ id: userId })) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const company = await this.companyRepository.findOne({
      where: { owner: { id: userId } },
      select: ['id', 'name'],
    });

    return {
      hasCompany: !!company,
      companyId: company?.id || null,
      companyName: company?.name || null,
    };
  }
}
