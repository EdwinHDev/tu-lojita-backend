import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { UserRole } from 'src/user/types/user-role.enum';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
  ) {}

  async create(createCompanyDto: CreateCompanyDto, user: User) {
    // 1. Verificar si el usuario ya tiene una empresa registrada
    const existingUserCompany = await this.companyRepository.findOne({
      where: { owner: { id: user.id } },
    });

    if (existingUserCompany) {
      throw new ConflictException('El usuario ya tiene una empresa registrada');
    }

    // 2. Verificar si el RIF ya está en uso
    await this.checkRifUniqueness(createCompanyDto.rif);

    const company = this.companyRepository.create({
      ...createCompanyDto,
      owner: user,
    });
    const savedCompany = await this.companyRepository.save(company);

    // Si el usuario era VENDOR, asociar su tienda existente a la empresa
    if (user.role === UserRole.VENDOR) {
      const userStore = await this.storeRepository.findOne({
        where: { owner: { id: user.id } },
      });

      if (userStore) {
        // Asociar la tienda a la empresa y sincronizar identidad
        userStore.company = savedCompany;
        userStore.name = savedCompany.name;
        userStore.rif = savedCompany.rif;
        userStore.logo = savedCompany.logo;
        await this.storeRepository.save(userStore);
      }
    }

    // 3. Vincular bidireccionalmente el usuario y la empresa
    user.company = savedCompany;
    if (user.role === UserRole.USER || user.role === UserRole.VENDOR) {
      user.role = UserRole.COMPANY;
    }
    await this.userRepository.save(user);

    return savedCompany;
  }

  findAll() {
    return this.companyRepository.find({
      relations: ['stores', 'owner'],
    });
  }

  async findOne(id: string) {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['stores', 'owner'],
    });

    if (!company) {
      throw new NotFoundException(`Empresa con ID ${id} no encontrada`);
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto, user: User) {
    const company = await this.findOne(id);

    // Validar propiedad (solo dueño o ADMIN pueden editar)
    if (company.owner?.id !== user.id && user.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'No tienes permiso para editar esta empresa',
      );
    }

    // Si se está actualizando el RIF, verificar unicidad
    if (updateCompanyDto.rif && updateCompanyDto.rif !== company.rif) {
      await this.checkRifUniqueness(updateCompanyDto.rif, id);
    }

    this.companyRepository.merge(company, updateCompanyDto);
    const updatedCompany = await this.companyRepository.save(company);

    // Propagar cambios a las tiendas si cambió el nombre, rif o logo
    if (
      updateCompanyDto.name ||
      updateCompanyDto.rif ||
      updateCompanyDto.logo
    ) {
      await this.storeRepository.update(
        { company: { id: updatedCompany.id } },
        {
          ...(updateCompanyDto.name && { name: updatedCompany.name }),
          ...(updateCompanyDto.rif && { rif: updatedCompany.rif }),
          ...(updateCompanyDto.logo && { logo: updatedCompany.logo }),
        },
      );
    }

    return updatedCompany;
  }

  async remove(id: string) {
    const company = await this.findOne(id);
    await this.companyRepository.remove(company);
    return { deleted: true };
  }

  private async checkRifUniqueness(
    rif: string,
    excludeCompanyId?: string,
  ): Promise<void> {
    const existingCompany = await this.companyRepository.findOne({
      where: { rif },
    });

    if (existingCompany && existingCompany.id !== excludeCompanyId) {
      throw new BadRequestException(
        'El RIF ya está registrado por otra empresa',
      );
    }
  }
}
