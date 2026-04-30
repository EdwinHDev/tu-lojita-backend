import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from 'src/user/types/user-role.enum';
import { RoleProtected } from './role-protected.decorator';
import { UserRoleGuard } from '../guards/user-role.guard';
import { PlatformAccessGuard } from 'src/common/guards/platform-access.guard';

export function Auth(...roles: UserRole[]) {
  return applyDecorators(
    RoleProtected(...roles), // 1. Etiqueta la ruta con los roles
    UseGuards(AuthGuard('jwt'), UserRoleGuard, PlatformAccessGuard), // 2. Ejecuta JWT, roles y validación de plataforma
  );
}
