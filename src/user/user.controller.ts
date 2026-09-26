import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserPaginationDto } from './dto/user-pagination.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { UserRole } from './types/user-role.enum';

@Controller(['users', 'user'])
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto);
  }

  @Get()
  @Auth(UserRole.ADMIN) // <-- Solo ADMIN y SUPER pueden entrar
  findAll(@Query() paginationDto: UserPaginationDto) {
    return this.userService.findAll(paginationDto);
  }

  @Get('metrics/summary')
  @Auth(UserRole.ADMIN)
  getMetricsSummary() {
    return this.userService.getPlatformMetrics();
  }

  @Auth()
  @Get('check/has-store')
  checkHasStore(@GetUser('id') userId: string) {
    return this.userService.checkHasStore(userId);
  }

  @Auth()
  @Get('check/has-company')
  checkHasCompany(@GetUser('id') userId: string) {
    return this.userService.checkHasCompany(userId);
  }

  @Auth()
  @Patch('profile')
  updateProfile(
    @GetUser('id') userId: string,
    @Body() updateProfileDto: UpdateProfileDto,
  ) {
    return this.userService.updateProfile(userId, updateProfileDto);
  }

  @Auth()
  @Get('me/mediations')
  getMyMediations(
    @GetUser('id') userId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.userService.getMyMediations(userId, storeId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.userService.findOne(id);
  }

  @Auth(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.userService.update(id, updateUserDto);
  }

  @Auth(UserRole.ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.userService.remove(id);
  }
}
