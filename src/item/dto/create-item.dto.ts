import { IsArray, IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsObject, IsOptional, IsString, IsUrl, IsUUID, MaxLength, Min, MinLength } from "class-validator";
import { ItemType } from "../types/item-type.enum";
import { PriceType } from "../types/price-type.enum";
import { ItemAttributes } from "../types/item-attributes.interface";

export class CreateItemDto {
  @IsString({ message: 'El título debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'El título no puede estar vacío' })
  @MinLength(3, { message: 'El título debe tener al menos 3 caracteres' })
  @MaxLength(100, { message: 'El título debe tener menos de 100 caracteres' })
  title: string;

  @IsString({ message: 'El ID de la tienda debe ser una cadena de texto' })
  @IsUUID('4', { message: 'El ID de la tienda debe ser un UUID válido' })
  storeId: string;

  @IsString({ message: 'El ID de la categoría debe ser una cadena de texto' })
  @IsUUID('4', { message: 'El ID de la categoría debe ser un UUID válido' })
  @IsOptional()
  categoryId?: string;

  @IsString({ message: 'La descripción debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La descripción no puede estar vacía' })
  @MinLength(10, { message: 'La descripción debe tener al menos 10 caracteres' })
  @MaxLength(2000, { message: 'La descripción debe tener menos de 2000 caracteres' })
  description: string;

  @IsNumber({}, { message: 'El precio debe ser un número válido' })
  @Min(0, { message: 'El precio no puede ser negativo' })
  @IsOptional()
  price?: number;

  @IsEnum(PriceType, { message: 'El tipo de precio no es válido' })
  @IsOptional()
  priceType?: PriceType;

  @IsString({ message: 'La imagen principal debe ser una cadena de texto' })
  @IsNotEmpty({ message: 'La imagen principal es obligatoria' })
  mainImage: string;

  @IsArray({ message: 'Las imágenes deben ser una lista (array)' })
  @IsString({ each: true, message: 'Cada imagen debe ser una cadena de texto (URL)' })
  @IsNotEmpty({ message: 'Debes proporcionar al menos una imagen' })
  images: string[];

  @IsEnum(ItemType, { message: 'El tipo de item debe ser PRODUCT o SERVICE' })
  itemType: ItemType;

  @IsBoolean({ message: 'isFeatured debe ser un valor booleano' })
  @IsOptional()
  isFeatured?: boolean;

  @IsNumber({}, { message: 'El precio de descuento debe ser un número válido' })
  @Min(0, { message: 'El precio de descuento no puede ser negativo' })
  @IsOptional()
  discountPrice?: number;

  @IsBoolean({ message: 'trackInventory debe ser un valor booleano' })
  @IsOptional()
  trackInventory?: boolean;

  @IsNumber({}, { message: 'La cantidad en stock debe ser un número' })
  @Min(0, { message: 'La cantidad en stock no puede ser negativa' })
  @IsOptional()
  stockQuantity?: number;

  @IsBoolean({ message: 'requiresBooking debe ser un valor booleano' })
  @IsOptional()
  requiresBooking?: boolean;

  /**
   * Atributos dinámicos. 
   * Nota: Para una validación estricta por tipo (Food, Service, etc.) 
   * se recomienda usar un Custom Validator o lógica en el Service, 
   * ya que class-validator no maneja fácilmente uniones discriminadas 
   * basadas en campos hermanos sin tipos anidados.
   */
  @IsObject({ message: 'Los atributos deben ser un objeto válido' })
  @IsOptional()
  attributes?: ItemAttributes;
}
