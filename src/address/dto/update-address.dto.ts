import { PartialType } from '@nestjs/mapped-types';
import { CreateAddressDto } from './create-address.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateAddressDto extends PartialType(CreateAddressDto) {
  @IsBoolean({ message: 'El estado debe ser un booleano' })
  @IsOptional()
  isActive: boolean;
}
