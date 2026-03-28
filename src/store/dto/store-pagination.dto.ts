import { IsNumber, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class StorePaginationDto extends PaginationDto {
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la categoría (Padre) debe ser un UUID válido' })
  categoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la subcategoría debe ser un UUID válido' })
  subCategoryId?: string;

  @IsOptional()
  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'El estado debe ser una cadena de texto' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'El término de búsqueda (q) debe ser una cadena de texto' })
  q?: string;
}
