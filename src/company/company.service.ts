import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types/user-role.enum';

@Injectable()
export class CompanyService {

  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) { }

  async create(createCompanyDto: CreateCompanyDto, user: User) {
    const company = this.companyRepository.create({
      ...createCompanyDto,
      owner: user,
    });
    const savedCompany = await this.companyRepository.save(company);

    // Si el usuario era USER o VENDOR, lo promovemos a COMPANY
    if (user.role === UserRole.USER || user.role === UserRole.VENDOR) {
      await this.userRepository.update(user.id, { role: UserRole.COMPANY });
    }

    return savedCompany;
  }

  findAll() {
    return this.companyRepository.find({
      relations: ['stores', 'owner']
    });
  }

  async findOne(id: string) {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: ['stores', 'owner']
    });

    if (!company) {
      throw new NotFoundException(`Empresa con ID ${id} no encontrada`);
    }

    return company;
  }

  async update(id: string, updateCompanyDto: UpdateCompanyDto) {
    const company = await this.findOne(id);
    this.companyRepository.merge(company, updateCompanyDto);
    return await this.companyRepository.save(company);
  }

  async remove(id: string) {
    const company = await this.findOne(id);
    await this.companyRepository.remove(company);
    return { deleted: true };
  }
}
