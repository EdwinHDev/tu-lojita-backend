import {
  IsBoolean,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class ItemVariantDto {
  @IsString({ message: 'El ID de la variante debe ser una cadena de texto' })
  @IsOptional()
  id?: string;

  @IsString({ message: 'El SKU debe ser una cadena de texto' })
  @IsOptional()
  sku?: string;

  @IsNumber({}, { message: 'El precio debe ser un número válido' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  @IsOptional()
  price?: number;

  @IsNumber({}, { message: 'El precio de descuento debe ser un número válido' })
  @Min(0, { message: 'El precio de descuento no puede ser negativo' })
  @IsOptional()
  discountPrice?: number;

  @IsNumber({}, { message: 'La cantidad en stock debe ser un número' })
  @Min(0, { message: 'La cantidad en stock no puede ser negativa' })
  @IsOptional()
  stockQuantity?: number;

  @IsBoolean({ message: 'isActive debe ser un booleano' })
  @IsOptional()
  isActive?: boolean;

  @IsObject({ message: 'axisValues debe ser un mapa de { [eje]: valor }' })
  axisValues: Record<string, string>;

  @IsString({ message: 'La URL de la imagen debe ser una cadena de texto' })
  @IsOptional()
  imageUrl?: string;
}
