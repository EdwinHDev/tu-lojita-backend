import { UserRole } from 'src/user/types';
import { User } from 'src/user/entities/user.entity';

export function transformUserDataByRole(
  user: User,
  requestingUserRole: UserRole,
  requestingUserId?: string,
) {
  if (!user) return null;

  // Si el usuario está viendo sus propios datos, retornar todo
  if (requestingUserId && user.id === requestingUserId) {
    return user;
  }

  // Si es ADMIN, puede ver todos los datos de cualquier usuario
  if (requestingUserRole === UserRole.ADMIN) {
    return user;
  }

  // Si es COMPANY, puede ver datos extendidos de otros usuarios
  if (requestingUserRole === UserRole.COMPANY) {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      addresses: user.addresses,
      avatarUrl: user.avatarUrl,
      phone: user.phone,
      identification: user.identification,
    };
  }

  // Para usuarios normales viendo datos de otros, solo datos básicos
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
  };
}
