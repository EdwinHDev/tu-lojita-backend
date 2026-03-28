import { Type } from 'class-transformer';
import { IsOptional, IsPositive, IsString, Min } from 'class-validator';

export class PaginationDto {
  @IsOptional()
  @IsPositive({ message: 'El límite debe ser un número positivo' })
  @Type(() => Number)
  limit?: number = 10;

  @IsOptional()
  @Min(0, { message: 'El offset no puede ser negativo' })
  @Type(() => Number)
  offset?: number = 0;

  @IsOptional()
  @IsString({ message: 'El campo de ordenamiento debe ser una cadena de texto' })
  sort?: string = 'createdAt';

  @IsOptional()
  @IsString({ message: 'La dirección de ordenamiento debe ser una cadena de texto' })
  order?: 'ASC' | 'DESC' = 'DESC';
}
