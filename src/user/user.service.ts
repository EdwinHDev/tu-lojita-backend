import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { User } from './entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { AppOrigin } from 'src/auth/types/app-origin.enum';
import { UserRole } from './types/user-role.enum';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { companyId, storeId, appOrigin, ...userDetails } = createUserDto;

    const existingUser = await this.userRepository.findOne({ where: { email: userDetails.email } });

    if (existingUser) {
      if (appOrigin === AppOrigin.CLIENT || appOrigin === AppOrigin.SELLER) {
        throw new BadRequestException('El correo ya está en uso.');
      }
      if (appOrigin === AppOrigin.BUSINESS) {
        if (existingUser.role === UserRole.VENDOR) {
          existingUser.role = UserRole.COMPANY;
        } else {
          throw new BadRequestException('El correo ya está registrado y no es elegible para esta aplicación.');
        }
      }
    } else {
      if (appOrigin === AppOrigin.BUSINESS) {
        throw new BadRequestException('Debes registrarte primero en la aplicación de Sellers.');
      }
      if (!userDetails.role) {
        if (appOrigin === AppOrigin.CLIENT) userDetails.role = UserRole.USER;
        if (appOrigin === AppOrigin.SELLER) userDetails.role = UserRole.VENDOR;
      }
    }

    let company: Company | undefined;
    if (companyId) {
      company =
        (await this.companyRepository.findOneBy({ id: companyId })) ??
        undefined;
      if (!company)
        throw new NotFoundException(
          `Empresa con ID ${companyId} no encontrada`,
        );
    }

    let store: Store | undefined;
    if (storeId) {
      store =
        (await this.storeRepository.findOneBy({ id: storeId })) ?? undefined;
      if (!store)
        throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
    }

    if (existingUser) {
      if (company) existingUser.company = company;
      if (store) existingUser.store = store;
      this.userRepository.merge(existingUser, userDetails);
      return await this.userRepository.save(existingUser);
    }

    const user = this.userRepository.create({
      ...userDetails,
      company,
      store,
    });

    return await this.userRepository.save(user);
  }

  findAll() {
    const users = this.userRepository.find({
      relations: ['addresses', 'company', 'store'],
    });
    return users;
  }

  async findOne(id: string) {
    const user = await this.userRepository.findOne({
      where: { id },
      relations: ['addresses', 'company', 'store'],
    });

    if (!user)
      throw new NotFoundException(`Usuario con ID ${id} no encontrado`);
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    const { companyId, storeId, ...updateDetails } = updateUserDto;
    const user = await this.findOne(id);

    if (companyId !== undefined) {
      if (companyId) {
        const company =
          (await this.companyRepository.findOneBy({ id: companyId })) ??
          undefined;
        if (!company)
          throw new NotFoundException(
            `Empresa con ID ${companyId} no encontrada`,
          );
        user.company = company;
      } else {
        user.company = undefined;
      }
    }

    if (storeId !== undefined) {
      if (storeId) {
        const store =
          (await this.storeRepository.findOneBy({ id: storeId })) ?? undefined;
        if (!store)
          throw new NotFoundException(`Tienda con ID ${storeId} no encontrada`);
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
    if (!(await this.userRepository.findOneBy({ id: userId }))) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    const store = await this.storeRepository.findOne({
      where: { owner: { id: userId } },
      select: ['id', 'name', 'rif', 'logo'],
    });

    return {
      hasStore: !!store,
      storeId: store?.id || null,
      storeName: store?.name || null,
      storeRif: store?.rif || null,
      storeLogo: store?.logo || null,
    };
  }

  async checkHasCompany(userId: string) {
    if (!(await this.userRepository.findOneBy({ id: userId }))) {
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

  async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
    const user = await this.findOne(userId);

    if (updateProfileDto.identification !== undefined) {
      user.identification = updateProfileDto.identification;
    }

    if (updateProfileDto.phone !== undefined) {
      user.phone = updateProfileDto.phone;
    }

    return await this.userRepository.save(user);
  }
}
