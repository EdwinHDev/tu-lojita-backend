import { Type, Transform } from 'class-transformer';
import { IsOptional, IsNumber, IsUUID, IsString, Min, IsBoolean, IsEnum } from 'class-validator';
import { PriceType } from '../types/price-type.enum';
import { PaginationDto } from 'src/common/dto/pagination.dto';

export class ItemPaginationDto extends PaginationDto {
  @IsOptional()
  @IsNumber({}, { message: 'El precio mínimo debe ser un número' })
  @Min(0, { message: 'El precio mínimo no puede ser negativo' })
  @Type(() => Number)
  minPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'El precio máximo debe ser un número' })
  @Min(0, { message: 'El precio máximo no puede ser negativo' })
  @Type(() => Number)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(PriceType, { message: 'El tipo de precio no es válido' })
  priceType?: PriceType;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la categoría interna debe ser un UUID válido' })
  storeCategoryId?: string;

  @IsOptional()
  @IsUUID('4', { message: 'El ID de la categoría global debe ser un UUID válido' })
  globalCategoryId?: string;

  @IsOptional()
  @IsString({ message: 'La ciudad debe ser una cadena de texto' })
  city?: string;

  @IsOptional()
  @IsString({ message: 'El estado debe ser una cadena de texto' })
  state?: string;

  @IsOptional()
  @IsString({ message: 'El término de búsqueda (q) debe ser una cadena de texto' })
  q?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  hasDiscount?: boolean;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  onlyInStock?: boolean;
}
