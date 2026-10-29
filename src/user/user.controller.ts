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
import { CreateSuspensionAppealDto } from './dto/create-suspension-appeal.dto';
import { ReviewSuspensionAppealDto } from './dto/review-suspension-appeal.dto';
import { ProvideAdditionalInfoAppealDto } from './dto/provide-additional-info-appeal.dto';
import { SuspendUserDto } from './dto/suspend-user.dto';
import { AppealStatus } from './entities/suspension-appeal.entity';

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

  @Auth()
  @Post('suspension-appeal')
  createAppeal(
    @GetUser('id') userId: string,
    @Body() dto: CreateSuspensionAppealDto,
  ) {
    return this.userService.createAppeal(userId, dto);
  }

  @Auth()
  @Get('suspension-appeal/my-status')
  getMyAppealStatus(@GetUser('id') userId: string) {
    return this.userService.getMyAppealStatus(userId);
  }

  @Auth(UserRole.ADMIN)
  @Get('suspension-appeal/all')
  getAllAppeals(@Query('status') status?: AppealStatus) {
    return this.userService.getAllAppeals(status);
  }

  @Auth(UserRole.ADMIN)
  @Patch('suspension-appeal/:id/review')
  reviewAppeal(
    @Param('id') appealId: string,
    @GetUser('id') adminId: string,
    @Body() dto: ReviewSuspensionAppealDto,
  ) {
    return this.userService.reviewAppeal(appealId, adminId, dto);
  }

  @Auth()
  @Post('suspension-appeal/:id/provide-info')
  provideAdditionalInfo(
    @Param('id') appealId: string,
    @GetUser('id') userId: string,
    @Body() dto: ProvideAdditionalInfoAppealDto,
  ) {
    return this.userService.provideAdditionalInfo(userId, appealId, dto);
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

  @Auth(UserRole.ADMIN)
  @Post(':id/lift-suspension')
  liftSuspension(
    @Param('id') id: string,
    @GetUser('id') adminId: string,
  ) {
    return this.userService.liftSuspension(id, adminId);
  }

  @Auth(UserRole.ADMIN)
  @Post(':id/suspend')
  suspendUser(
    @Param('id') id: string,
    @GetUser('id') adminId: string,
    @Body() suspendUserDto: SuspendUserDto,
  ) {
    return this.userService.suspendUser(id, suspendUserDto, adminId);
  }
}
