import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Bank } from './entities/bank.entity';

@Injectable()
export class BankService implements OnModuleInit {
  constructor(
    @InjectRepository(Bank)
    private readonly bankRepository: Repository<Bank>,
  ) {}

  async onModuleInit() {
    const count = await this.bankRepository.count();
    if (count === 0) {
      await this.seedBanks();
    }
  }

  async findAll() {
    return await this.bankRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  private async seedBanks() {
    const banks = [
      { code: '0001', name: 'Banco Central de Venezuela' },
      { code: '0102', name: 'Banco de Venezuela' },
      { code: '0104', name: 'Banco Venezolano de Crédito' },
      { code: '0105', name: 'Banco Mercantil' },
      { code: '0108', name: 'BBVA Provincial' },
      { code: '0114', name: 'Bancaribe' },
      { code: '0115', name: 'Banco Exterior' },
      { code: '0128', name: 'Banco Caroní' },
      { code: '0134', name: 'Banesco' },
      { code: '0137', name: 'Banco Sofitasa' },
      { code: '0138', name: 'Banco Plaza' },
      { code: '0146', name: 'Bangente' },
      { code: '0151', name: 'BFC Banco Fondo Común' },
      { code: '0156', name: '100% Banco' },
      { code: '0157', name: 'Del Sur' },
      { code: '0163', name: 'Banco del Tesoro' },
      { code: '0166', name: 'Banco Agrícola de Venezuela' },
      { code: '0168', name: 'Bancrecer' },
      { code: '0169', name: 'Mi Banco' },
      { code: '0171', name: 'Banco Activo' },
      { code: '0172', name: 'Bancamiga' },
      { code: '0174', name: 'Banplus' },
      { code: '0175', name: 'Banco Digital de los Trabajadores' },
      { code: '0177', name: 'BANFANB' },
      { code: '0191', name: 'Banco Nacional de Crédito (BNC)' },
    ];

    await this.bankRepository.save(banks);
  }
}
