import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserPaginationDto } from './dto/user-pagination.dto';
import { User } from './entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { StoreStatus } from 'src/store/types/status.enum';
import { Order } from 'src/order/entities/order.entity';
import { AppOrigin } from 'src/auth/types/app-origin.enum';
import { UserRole } from './types/user-role.enum';
import { MediationRequest } from 'src/store/entities/mediation-request.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(MediationRequest)
    private readonly mediationRequestRepository: Repository<MediationRequest>,
    private readonly dataSource: DataSource,
  ) {}

  async create(createUserDto: CreateUserDto) {
    const { companyId, storeId, appOrigin, ...userDetails } = createUserDto;

    const existingUser = await this.userRepository.findOne({
      where: { email: userDetails.email },
    });

    if (existingUser) {
      if (appOrigin === AppOrigin.CLIENT || appOrigin === AppOrigin.SELLER) {
        throw new BadRequestException('El correo ya está en uso.');
      }
      if (appOrigin === AppOrigin.BUSINESS) {
        if (existingUser.role === UserRole.VENDOR) {
          existingUser.role = UserRole.COMPANY;
        } else {
          throw new BadRequestException(
            'El correo ya está en uso.',
          );
        }
      }
    } else {
      if (!userDetails.role) {
        if (appOrigin === AppOrigin.CLIENT) userDetails.role = UserRole.USER;
        if (appOrigin === AppOrigin.SELLER) userDetails.role = UserRole.VENDOR;
        if (appOrigin === AppOrigin.BUSINESS) userDetails.role = UserRole.COMPANY;
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

  async findAll(paginationDto?: UserPaginationDto) {
    const {
      limit = 50,
      offset = 0,
      role,
      search,
      sort = 'createdAt',
      order = 'DESC',
    } = paginationDto || {};

    const queryBuilder = this.userRepository
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.addresses', 'addresses')
      .leftJoinAndSelect('user.company', 'company')
      .leftJoinAndSelect('user.store', 'store');

    if (role) {
      queryBuilder.andWhere('user.role = :role', { role });
    }

    if (search && search.trim().length > 0) {
      queryBuilder.andWhere(
        '(user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.phone ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    const validSortFields = [
      'createdAt',
      'firstName',
      'lastName',
      'email',
      'role',
      'isActive',
    ];
    const sortField = validSortFields.includes(sort as string)
      ? `user.${sort}`
      : 'user.createdAt';
    queryBuilder.orderBy(sortField, order);

    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset,
    };
  }

  async getPlatformMetrics() {
    const [totalUsers, totalClients, totalVendors, totalCompanies, totalAdmins] =
      await Promise.all([
        this.userRepository.count(),
        this.userRepository.count({ where: { role: UserRole.USER } }),
        this.userRepository.count({ where: { role: UserRole.VENDOR } }),
        this.userRepository.count({ where: { role: UserRole.COMPANY } }),
        this.userRepository.count({ where: { role: UserRole.ADMIN } }),
      ]);

    const [totalStores, activeStores, suspendedStores] = await Promise.all([
      this.storeRepository.count(),
      this.storeRepository.count({ where: { status: StoreStatus.ACTIVE } }),
      this.storeRepository.count({ where: { status: StoreStatus.SUSPENDED } }),
    ]);

    const orderRepo = this.dataSource.getRepository(Order);
    const totalOrders = await orderRepo.count();

    return {
      users: {
        total: totalUsers,
        clients: totalClients,
        vendors: totalVendors,
        companies: totalCompanies,
        admins: totalAdmins,
      },
      stores: {
        total: totalStores,
        active: activeStores,
        suspended: suspendedStores,
      },
      orders: {
        total: totalOrders,
      },
    };
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

    if (updateProfileDto.birthDate !== undefined) {
      user.birthDate = updateProfileDto.birthDate ? new Date(updateProfileDto.birthDate) : undefined;
    }

    return await this.userRepository.save(user);
  }

  async getMyMediations(customerId: string, storeId?: string) {
    const where: Record<string, any> = { customerId };
    if (storeId) where['storeId'] = storeId;

    const requests = await this.mediationRequestRepository.find({
      where,
      relations: ['store'],
      order: { createdAt: 'DESC' },
      select: {
        id: true,
        topic: true,
        message: true,
        status: true,
        storeResponse: true,
        storeId: true,
        createdAt: true,
        updatedAt: true,
        store: {
          id: true,
          name: true,
          logo: true,
        },
      },
    });

    return requests.map((req) => ({
      ...req,
      store: req.store
        ? {
            id: req.store.id,
            name: req.store.name,
            logo: req.store.logo,
            logoUrl: req.store.logo,
          }
        : null,
    }));
  }
}
