import { Controller, Get } from '@nestjs/common';
import { BankService } from './bank.service';
import { Auth } from 'src/auth/decorators/auth.decorator';

@Auth()
@Controller('banks')
export class BankController {
  constructor(private readonly bankService: BankService) { }

  @Get()
  findAll() {
    return this.bankService.findAll();
  }
}
