import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { UserRole } from 'src/user/types/user-role.enum';
import { FinancialAdminGuard } from 'src/financial-auth/guards/financial-admin.guard';
import { PlatformPaymentMethod } from './entities/platform-payment-method.entity';

@Controller('platform-payment-methods')
export class PlatformPaymentMethodController {
  constructor(
    @InjectRepository(PlatformPaymentMethod)
    private readonly methodRepository: Repository<PlatformPaymentMethod>,
  ) {}

  @Get()
  findAll() {
    return this.methodRepository.find({
      where: { isActive: true },
      order: { createdAt: 'ASC' },
    });
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Get('admin/all')
  findAllAdmin() {
    return this.methodRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Post()
  create(@Body() dto: Partial<PlatformPaymentMethod>) {
    const method = this.methodRepository.create(dto);
    return this.methodRepository.save(method);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() dto: Partial<PlatformPaymentMethod>,
  ) {
    const method = await this.methodRepository.findOne({ where: { id } });
    if (!method) throw new Error('Método de pago no encontrado');
    Object.assign(method, dto);
    return this.methodRepository.save(method);
  }

  @Auth(UserRole.ADMIN)
  @UseGuards(FinancialAdminGuard)
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const method = await this.methodRepository.findOne({ where: { id } });
    if (!method) throw new Error('Método de pago no encontrado');
    return this.methodRepository.remove(method);
  }
}
