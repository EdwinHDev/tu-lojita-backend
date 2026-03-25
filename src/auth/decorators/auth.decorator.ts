import { applyDecorators, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { UserRole } from 'src/user/types/user-role.enum';
import { RoleProtected } from './role-protected.decorator';
import { UserRoleGuard } from '../guards/user-role.guard';

export function Auth(...roles: UserRole[]) {
  return applyDecorators(
    RoleProtected(...roles), // 1. Etiqueta la ruta con los roles
    UseGuards(AuthGuard('jwt'), UserRoleGuard), // 2. Ejecuta la estrategia JWT y luego el Guard de roles
  );
}