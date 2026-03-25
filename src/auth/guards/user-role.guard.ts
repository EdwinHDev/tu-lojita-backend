import { Reflector } from '@nestjs/core';
import { BadRequestException, CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';
import { User } from 'src/user/entities/user.entity';
import { META_ROLES } from '../decorators/role-protected.decorator';

@Injectable()
export class UserRoleGuard implements CanActivate {
  // Reflector nos permite leer los metadatos que guardó el decorador @RoleProtected
  constructor(private readonly reflector: Reflector) { }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {

    // 1. Leemos qué roles requiere esta ruta en específico
    const validRoles: string[] = this.reflector.get(META_ROLES, context.getHandler());

    // 2. Si la ruta no tiene el decorador @RoleProtected, la dejamos pasar por defecto
    if (!validRoles) return true;
    if (validRoles.length === 0) return true;

    // 3. Extraemos el usuario de la request (recuerda que el AuthGuard('jwt') lo puso ahí antes)
    const req = context.switchToHttp().getRequest();
    const user = req.user as User;

    if (!user) {
      throw new BadRequestException('Usuario no encontrado (¿Olvidaste poner el AuthGuard?)');
    }

    // 4. Verificamos si el rol del usuario está dentro de los roles permitidos (O si es SUPER admin)
    if (validRoles.includes(user.role)) {
      return true;
    }

    // BONUS: Si tienes un rol de SUPER administrador que siempre puede hacer todo, puedes añadir esto:
    // if (user.role === UserRole.SUPER) return true;

    // 5. Si llega hasta aquí, no tiene permisos
    throw new ForbiddenException(
      `El usuario ${user.firstName} necesita uno de estos roles: [${validRoles}]`
    );
  }
}