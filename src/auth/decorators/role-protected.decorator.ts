import { SetMetadata } from '@nestjs/common';
import { UserRole } from 'src/user/types/user-role.enum';

// Definimos una constante para no equivocarnos al escribir el string en el Guard
export const META_ROLES = 'roles';

// Este decorador recibe una lista de roles permitidos y los guarda en los "Metadatos" de la ruta
export const RoleProtected = (...args: UserRole[]) => {
  return SetMetadata(META_ROLES, args);
};