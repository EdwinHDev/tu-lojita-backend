import { Controller, Get, Post, Body, Patch, Param, Delete, Query } from '@nestjs/common';
import { StoreService } from './store.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { StorePaginationDto } from './dto/store-pagination.dto';

@Auth()
@Controller('stores')
export class StoreController {
  constructor(private readonly storeService: StoreService) { }

  @Post()
  create(
    @Body() createStoreDto: CreateStoreDto,
    @GetUser() user: User,
  ) {
    return this.storeService.create(createStoreDto, user);
  }

  @Get()
  findAll(@Query() storePaginationDto: StorePaginationDto) {
    return this.storeService.findAll(storePaginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.storeService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateStoreDto: UpdateStoreDto,
    @GetUser() user: User,
  ) {
    return this.storeService.update(id, updateStoreDto, user);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.storeService.remove(id);
  }
}
