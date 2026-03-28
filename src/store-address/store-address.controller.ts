import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { StoreAddressService } from './store-address.service';
import { CreateStoreAddressDto } from './dto/create-store-address.dto';
import { UpdateStoreAddressDto } from './dto/update-store-address.dto';

@Controller('store-address')
export class StoreAddressController {
  constructor(private readonly storeAddressService: StoreAddressService) {}

  @Post()
  create(@Body() createStoreAddressDto: CreateStoreAddressDto) {
    return this.storeAddressService.create(createStoreAddressDto);
  }

  @Get()
  findAll() {
    return this.storeAddressService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storeAddressService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateStoreAddressDto: UpdateStoreAddressDto) {
    return this.storeAddressService.update(+id, updateStoreAddressDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storeAddressService.remove(+id);
  }
}
