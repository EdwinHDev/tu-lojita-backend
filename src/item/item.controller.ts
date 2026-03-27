import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ItemService } from './item.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';

@Auth()
@Controller('items')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Post()
  create(
    @Body() createItemDto: CreateItemDto,
    @GetUser() user: User,
  ) {
    return this.itemService.create(createItemDto, user);
  }

  @Get()
  findAll() {
    return this.itemService.findAll();
  }

  @Get('store/:storeId')
  findByStore(@Param('storeId') storeId: string) {
    return this.itemService.findByStore(storeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.itemService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
    @GetUser() user: User,
  ) {
    return this.itemService.update(id, updateItemDto, user);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @GetUser() user: User,
  ) {
    return this.itemService.remove(id, user);
  }
}
