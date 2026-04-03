import { Injectable } from '@nestjs/common';
import { CreateStoreAddressDto } from './dto/create-store-address.dto';
import { UpdateStoreAddressDto } from './dto/update-store-address.dto';

@Injectable()
export class StoreAddressService {
  create(createStoreAddressDto: CreateStoreAddressDto) {
    return 'This action adds a new storeAddress';
  }

  findAll() {
    return `This action returns all storeAddress`;
  }

  findOne(id: string) {
    return `This action returns a #${id} storeAddress`;
  }

  update(id: string, updateStoreAddressDto: UpdateStoreAddressDto) {
    return `This action updates a #${id} storeAddress`;
  }

  remove(id: string) {
    return `This action removes a #${id} storeAddress`;
  }
}
