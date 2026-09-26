import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import { OrderDisputeService } from './order-dispute.service';
import {
  CreateDisputeDto,
  RespondDisputeDto,
  ResolveDisputeDto,
  QueryDisputeDto,
} from './dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';

@Controller('order-dispute')
export class OrderDisputeController {
  constructor(private readonly disputeService: OrderDisputeService) {}

  @Auth()
  @Post()
  create(@Body() dto: CreateDisputeDto, @GetUser() user: User) {
    return this.disputeService.create(dto, user);
  }

  @Auth()
  @Get('order/:orderId')
  findByOrder(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @GetUser() user: User,
  ) {
    return this.disputeService.findByOrder(orderId, user);
  }

  @Auth(UserRole.ADMIN)
  @Get()
  findAll(@Query() query: QueryDisputeDto) {
    return this.disputeService.findAll(query);
  }

  @Auth()
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.disputeService.findOne(id);
  }

  @Auth(UserRole.VENDOR, UserRole.ADMIN, UserRole.COMPANY)
  @Patch(':id/respond')
  respond(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RespondDisputeDto,
    @GetUser() user: User,
  ) {
    return this.disputeService.respond(id, dto, user);
  }

  @Auth()
  @Patch(':id/mark-resolved')
  markResolved(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    return this.disputeService.markResolved(id, user);
  }

  @Auth()
  @Patch(':id/escalate')
  escalate(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser() user: User,
  ) {
    return this.disputeService.escalate(id, user);
  }

  @Auth(UserRole.ADMIN)
  @Patch(':id/resolve')
  resolve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ResolveDisputeDto,
    @GetUser() adminUser: User,
  ) {
    return this.disputeService.resolve(id, dto, adminUser);
  }
}
