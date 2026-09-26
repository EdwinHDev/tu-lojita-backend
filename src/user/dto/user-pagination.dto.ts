import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationDto } from 'src/common/dto/pagination.dto';
import { UserRole } from '../types/user-role.enum';

export class UserPaginationDto extends PaginationDto {
  @IsOptional()
  @IsEnum(UserRole, { message: 'El rol no es válido' })
  role?: UserRole;

  @IsOptional()
  @IsString({ message: 'El término de búsqueda debe ser texto' })
  search?: string;
}
