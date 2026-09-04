import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { FinancialOtp } from './entities/financial-otp.entity';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import { MailService } from 'src/common/mail/mail.service';

@Injectable()
export class FinancialAuthService {
  private readonly logger = new Logger(FinancialAuthService.name);

  constructor(
    @InjectRepository(FinancialOtp)
    private readonly otpRepository: Repository<FinancialOtp>,
    private readonly mailService: MailService,
  ) {}

  async requestOtp(user: User): Promise<{ message: string }> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo los administradores pueden solicitar acceso financiero');
    }

    // Invalidate previous unused OTPs for this user
    await this.otpRepository.update(
      { email: user.email, isUsed: false },
      { isUsed: true },
    );

    // Generate 6-digit code (e.g. 749201)
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = bcrypt.hashSync(code, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 min TTL

    const otpRecord = this.otpRepository.create({
      email: user.email,
      codeHash,
      expiresAt,
      isUsed: false,
    });
    await this.otpRepository.save(otpRecord);

    const adminName = `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`;
    await this.mailService.sendFinancialOtpEmail(user.email, adminName, code);

    return { message: `Código de verificación enviado al correo ${user.email}` };
  }

  async verifyOtp(
    user: User,
    code: string,
  ): Promise<{ financialAccessToken: string; expiresInMinutes: number }> {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Solo los administradores pueden acceder a este módulo');
    }

    const activeOtp = await this.otpRepository.findOne({
      where: {
        email: user.email,
        isUsed: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    if (!activeOtp) {
      throw new UnauthorizedException('No hay un código OTP activo o ya ha expirado. Solicita uno nuevo.');
    }

    const isValid = bcrypt.compareSync(code.trim(), activeOtp.codeHash);
    if (!isValid) {
      throw new UnauthorizedException('Código de verificación incorrecto.');
    }

    // Mark OTP as used and generate 45-minute session access token
    activeOtp.isUsed = true;
    const accessToken = randomUUID();
    const tokenExpiresAt = new Date();
    tokenExpiresAt.setMinutes(tokenExpiresAt.getMinutes() + 45);

    activeOtp.accessToken = accessToken;
    activeOtp.tokenExpiresAt = tokenExpiresAt;
    await this.otpRepository.save(activeOtp);

    return {
      financialAccessToken: accessToken,
      expiresInMinutes: 45,
    };
  }

  async validateFinancialToken(token: string): Promise<boolean> {
    if (!token) return false;

    const record = await this.otpRepository.findOne({
      where: {
        accessToken: token,
        tokenExpiresAt: MoreThan(new Date()),
      },
    });

    return !!record;
  }
}
