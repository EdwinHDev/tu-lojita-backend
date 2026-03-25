import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { AddressService } from './address.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { Auth } from 'src/auth/decorators/auth.decorator';

@Auth()
@Controller('address')
export class AddressController {
  constructor(private readonly addressService: AddressService) { }

  @Post()
  create(
    @Body() createAddressDto: CreateAddressDto,
    @GetUser('id') userId: string
  ) {
    return this.addressService.create(createAddressDto, userId);
  }

  @Get()
  findAll(@GetUser('id') userId: string) {
    return this.addressService.findAll(userId);
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @GetUser('id') userId: string // Seguridad: Validar que sea dueño
  ) {
    return this.addressService.findOne(id, userId);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateAddressDto: UpdateAddressDto,
    @GetUser('id') userId: string // Inyectamos userId
  ) {
    return this.addressService.update(id, updateAddressDto, userId);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetUser('id') userId: string // Inyectamos userId
  ) {
    return this.addressService.remove(id, userId);
  }
}
