import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { UserRole } from 'src/user/types';
import { envs } from 'src/config/envs';

export enum Platform {
  WEB_VENDOR = 'WEB_VENDOR',
  WEB_ADMIN = 'WEB_ADMIN',
  WEB_CUSTOMER = 'WEB_CUSTOMER',
  APP_BUSINESS = 'APP_BUSINESS',
  APP_CUSTOMER = 'APP_CUSTOMER',
  APP_DELIVERY = 'APP_DELIVERY',
  UNKNOWN = 'UNKNOWN',
}

@Injectable()
export class PlatformAccessGuard implements CanActivate {
  // Lista blanca de origins permitidos (NO MODIFICABLE por el usuario)
  private readonly allowedOrigins: Record<string, Platform> = {
    // Desarrollo
    [envs.frontendVendorUrlDev]: Platform.WEB_VENDOR,
    [envs.frontendAdminUrlDev]: Platform.WEB_ADMIN,
    [envs.frontendCustomerUrlDev]: Platform.WEB_CUSTOMER,
    // Producción
    [envs.frontendVendorUrlProd]: Platform.WEB_VENDOR,
    [envs.frontendAdminUrlProd]: Platform.WEB_ADMIN,
    [envs.frontendCustomerUrlProd]: Platform.WEB_CUSTOMER,
    'https://www.tulojita.com': Platform.WEB_CUSTOMER, // Alias adicional
  };

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Si no hay usuario autenticado, dejar pasar (AuthGuard se encargará)
    if (!user) {
      return true;
    }

    // Identificar plataforma
    const platform = this.identifyPlatform(request);

    // Inyectar plataforma en request para uso posterior
    request.platform = platform;

    // REGLA DE NEGOCIO: Usuarios COMPANY no pueden acceder desde WEB_VENDOR
    if (user.role === UserRole.COMPANY && platform === Platform.WEB_VENDOR) {
      throw new ForbiddenException({
        statusCode: 403,
        message: 'Acceso denegado desde esta plataforma',
        reason: 'COMPANY_NOT_ALLOWED_ON_VENDOR_WEB',
        details:
          'Los usuarios con rol COMPANY deben usar la aplicación móvil de negocios para gestionar múltiples tiendas y acceder a funcionalidades avanzadas.',
      });
    }

    return true;
  }

  private identifyPlatform(request: any): Platform {
    // 1. Intentar identificar por Origin (Webs - NO MODIFICABLE)
    const origin = request.headers.origin;
    if (origin && this.allowedOrigins[origin]) {
      return this.allowedOrigins[origin];
    }

    // 2. Intentar identificar por Referer como fallback (Webs)
    const referer = request.headers.referer;
    if (referer) {
      const refererOrigin = this.extractOriginFromReferer(referer);
      if (refererOrigin && this.allowedOrigins[refererOrigin]) {
        return this.allowedOrigins[refererOrigin];
      }
    }

    // 3. Identificar por User-Agent (Apps móviles - Configurado nativamente)
    const userAgent = request.headers['user-agent'] || '';

    if (userAgent.includes('TuLojitaBusiness')) {
      return Platform.APP_BUSINESS;
    }
    if (userAgent.includes('TuLojitaCustomer')) {
      return Platform.APP_CUSTOMER;
    }
    if (userAgent.includes('TuLojitaDelivery')) {
      return Platform.APP_DELIVERY;
    }

    // Si no se puede identificar, marcar como UNKNOWN
    return Platform.UNKNOWN;
  }

  private extractOriginFromReferer(referer: string): string | null {
    try {
      const url = new URL(referer);
      return `${url.protocol}//${url.host}`;
    } catch {
      return null;
    }
  }
}
