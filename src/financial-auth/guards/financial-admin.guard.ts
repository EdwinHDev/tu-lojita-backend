import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { FinancialAuthService } from '../financial-auth.service';

@Injectable()
export class FinancialAdminGuard implements CanActivate {
  constructor(private readonly financialAuthService: FinancialAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-financial-token'] as string;

    if (!token) {
      throw new ForbiddenException(
        'Acceso financiero bloqueado. Se requiere validación previa con código OTP.',
      );
    }

    const isValid = await this.financialAuthService.validateFinancialToken(token);
    if (!isValid) {
      throw new ForbiddenException(
        'La sesión de seguridad financiera ha expirado o no es válida. Solicita un nuevo código OTP.',
      );
    }

    return true;
  }
}
