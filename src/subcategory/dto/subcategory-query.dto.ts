import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class SubcategoryQueryDto {
  @IsOptional()
  @IsUUID('4', { message: 'El ID de la categoría debe ser un UUID válido' })
  categoryId?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  inUse?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isActive?: boolean;

  @IsOptional()
  @IsString({ message: 'El término de búsqueda (q) debe ser una cadena de texto' })
  q?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}
