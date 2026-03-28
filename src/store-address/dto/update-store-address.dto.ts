import { PartialType } from '@nestjs/mapped-types';
import { CreateStoreAddressDto } from './create-store-address.dto';

export class UpdateStoreAddressDto extends PartialType(CreateStoreAddressDto) {}
