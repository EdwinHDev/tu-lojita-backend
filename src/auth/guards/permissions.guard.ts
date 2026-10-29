import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { META_PERMISSIONS } from '../decorators/require-permissions.decorator';
import { UserRole } from 'src/user/types/user-role.enum';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.get<string[]>(
      META_PERMISSIONS,
      context.getHandler(),
    );

    // Si la ruta no exige permisos específicos, permitir acceso
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const req = context.switchToHttp().getRequest();
    const user = req.user;

    if (!user) {
      throw new ForbiddenException('Usuario no autenticado');
    }

    // 1. Super Administradores de la plataforma tienen acceso irrestricto
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // 2. El Propietario de la Empresa (dueño directo sin ser colaborador) tiene acceso total
    if (user.role === UserRole.COMPANY && !user.isCollaborator) {
      return true;
    }

    // 3. Colaboradores: verificar que posean TODOS los permisos requeridos
    const userPermissions: string[] = user.permissions || [];
    const missingPermissions = requiredPermissions.filter(
      (perm) => !userPermissions.includes(perm),
    );

    if (missingPermissions.length > 0) {
      throw new ForbiddenException(
        `No tienes los permisos necesarios para realizar esta acción: [${missingPermissions.join(
          ', ',
        )}]`,
      );
    }

    return true;
  }
}
