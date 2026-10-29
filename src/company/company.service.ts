import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { Subcategory } from 'src/subcategory/entities/subcategory.entity';
import { UserRole } from 'src/user/types/user-role.enum';
import { FinancialOtp } from 'src/financial-auth/entities/financial-otp.entity';
import { MailService } from 'src/common/mail/mail.service';
import { NotificationService } from 'src/notification/notification.service';
import { CompanyRoleService } from './services/company-role.service';

@Injectable()
export class CompanyService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Subcategory)
    private readonly subcategoryRepository: Repository<Subcategory>,
    @InjectRepository(FinancialOtp)
    private readonly otpRepository: Repository<FinancialOtp>,
    private readonly mailService: MailService,
    private readonly notificationService: NotificationService,
    private readonly roleService: CompanyRoleService,
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

    let subcategory: Subcategory | undefined;
    if (createCompanyDto.subcategoryId) {
      subcategory =
        (await this.subcategoryRepository.findOne({
          where: { id: createCompanyDto.subcategoryId },
          relations: ['category'],
        })) ?? undefined;

      if (!subcategory) {
        throw new NotFoundException('Subcategoría no encontrada');
      }
    }

    const company = this.companyRepository.create({
      name: createCompanyDto.name,
      rif: createCompanyDto.rif,
      logo: createCompanyDto.logo,
      phone: createCompanyDto.phone,
      description: createCompanyDto.description,
      subcategory,
      owner: user,
    });
    const savedCompany = await this.companyRepository.save(company);

    // Si el usuario era VENDOR, asociar su tienda existente a la empresa
    if (user.role === UserRole.VENDOR) {
      const userStore = await this.storeRepository.findOne({
        where: { owner: { id: user.id } },
        relations: ['subcategory'],
      });

      if (userStore) {
        // Si no se proporcionó subcategoría pero la tienda previa la tiene, adoptarla
        if (!savedCompany.subcategory && userStore.subcategory) {
          savedCompany.subcategory = userStore.subcategory;
          await this.companyRepository.save(savedCompany);
        } else if (savedCompany.subcategory) {
          // Sincronizar la tienda con la subcategoría de la empresa
          userStore.subcategory = savedCompany.subcategory;
        }

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

    // 4. Sembrar automáticamente el rol base de Administrador para la empresa
    try {
      await this.roleService.seedDefaultRole(savedCompany.id);
    } catch {
      // Ignorar si ya fue creado
    }

    return savedCompany;
  }

  findAll() {
    return this.companyRepository.find({
      relations: [
        'stores',
        'owner',
        'subcategory',
        'subcategory.category',
        'subscription',
      ],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const company = await this.companyRepository.findOne({
      where: { id },
      relations: [
        'stores',
        'owner',
        'subcategory',
        'subcategory.category',
        'subscription',
      ],
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

    // Si se actualiza el rubro/subcategoría
    if (updateCompanyDto.subcategoryId) {
      const subcategory = await this.subcategoryRepository.findOne({
        where: { id: updateCompanyDto.subcategoryId },
        relations: ['category'],
      });
      if (!subcategory) {
        throw new NotFoundException('Subcategoría no encontrada');
      }
      company.subcategory = subcategory;
      await this.storeRepository.update(
        { company: { id: company.id } },
        { subcategory: subcategory },
      );
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

  async requestDeleteOtp(
    id: string,
    adminUser: User,
  ): Promise<{ success: boolean; message: string; email: string }> {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo un administrador puede solicitar la eliminación de una empresa',
      );
    }

    const company = await this.findOne(id);

    // Invalidar OTPs anteriores no utilizados para este correo
    await this.otpRepository.update(
      { email: adminUser.email, isUsed: false },
      { isUsed: true },
    );

    // Generar código de 6 dígitos
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = bcrypt.hashSync(code, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutos de validez

    const otpRecord = this.otpRepository.create({
      email: adminUser.email,
      codeHash,
      expiresAt,
      isUsed: false,
    });
    await this.otpRepository.save(otpRecord);

    const adminName =
      `${adminUser.firstName || ''}${adminUser.lastName ? ' ' + adminUser.lastName : ''}`.trim() ||
      'Administrador';

    await this.mailService.sendCompanyDeleteOtpEmail(
      adminUser.email,
      adminName,
      company.name,
      code,
    );

    return {
      success: true,
      message: `Código de seguridad OTP enviado al correo ${adminUser.email}`,
      email: adminUser.email,
    };
  }

  async remove(id: string, adminUser: User, otpCode?: string) {
    if (adminUser.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Solo un administrador puede eliminar una empresa',
      );
    }

    if (!otpCode || otpCode.trim().length !== 6) {
      throw new BadRequestException(
        'Se requiere un código de seguridad OTP de 6 dígitos enviado a tu correo para eliminar una empresa',
      );
    }

    // Validar código OTP activo para el correo del administrador
    const activeOtp = await this.otpRepository.findOne({
      where: {
        email: adminUser.email,
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!activeOtp) {
      throw new UnauthorizedException(
        'El código OTP no existe o ha expirado. Solicita un nuevo código a tu correo.',
      );
    }

    const isValid = bcrypt.compareSync(otpCode.trim(), activeOtp.codeHash);
    if (!isValid) {
      throw new UnauthorizedException('Código de verificación OTP incorrecto.');
    }

    // Marcar OTP como utilizado
    activeOtp.isUsed = true;
    await this.otpRepository.save(activeOtp);

    const company = await this.findOne(id);
    const companyId = company.id;
    const logoUrl = company.logo;

    // Intentar borrar la imagen del Image Processor si es una URL local (/img/...)
    if (logoUrl && logoUrl.startsWith('/img/')) {
      try {
        const imageId = logoUrl.split('/').pop();
        const imagesUrl =
          process.env.API_BASE_URL_IMAGES || 'https://images.tulojita.com';
        const apiKey = process.env.API_KEY_IMAGES;
        await fetch(`${imagesUrl}/img/${imageId}`, {
          method: 'DELETE',
          headers: apiKey ? { 'x-api-key': apiKey } : {},
        });
      } catch (e) {
        // Silently continue if image deletion fails
      }
    }

    await this.companyRepository.manager.transaction(async (manager) => {
      // 1. Desvincular usuarios de la empresa y preservar rol COMPANY
      await manager
        .createQueryBuilder()
        .update(User)
        .set({ company: null, role: UserRole.COMPANY })
        .where('"companyId" = :companyId', { companyId })
        .execute();

      // 2. Borrar pagos de suscripción asociados
      await manager
        .createQueryBuilder()
        .delete()
        .from('subscription_payments')
        .where(
          '"subscriptionId" IN (SELECT id FROM company_subscriptions WHERE "companyId" = :companyId)',
          { companyId },
        )
        .execute();

      // 3. Borrar suscripción asociada
      await manager
        .createQueryBuilder()
        .delete()
        .from('company_subscriptions')
        .where('"companyId" = :companyId', { companyId })
        .execute();

      // 4. Borrar tiendas asociadas a la empresa
      await manager
        .createQueryBuilder()
        .delete()
        .from(Store)
        .where('"companyId" = :companyId', { companyId })
        .execute();

      // 5. Borrar la empresa
      await manager.delete(Company, { id: companyId });
    });

    // Notificar actualización de badges administrativos
    await this.notificationService.notifyAdminBadgesChanged().catch(() => {});

    return { deleted: true, companyId };
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
