import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { MailService } from './mail.service';

@Controller('mail')
export class MailController {
  constructor(private readonly mailService: MailService) {}

  @Get('test-send')
  async testSend(@Query('to') to: string) {
    if (!to) {
      throw new BadRequestException('El parámetro "to" es obligatorio (ej: /mail/test-send?to=tu-correo@gmail.com)');
    }
    return this.mailService.sendTestEmail(to);
  }
}
