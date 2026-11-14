import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { OptionalJwtAuthGuard } from 'src/auth/guards/optional-jwt-auth.guard';
import { UserRole } from 'src/user/types/user-role.enum';
import { CompanyCrmService } from '../services/company-crm.service';
import {
  CreateCrmCustomerNoteDto,
  CreateCrmTargetedOfferDto,
  CrmCustomersQueryDto,
  UpdateCrmCustomerProfileDto,
} from '../dto/company-crm.dto';
import { CrmOfferStatus } from '../entities/crm-targeted-offer.entity';

@Controller('companies/:companyId/crm')
@Auth(UserRole.COMPANY, UserRole.ADMIN)
export class CompanyCrmController {
  constructor(private readonly crmService: CompanyCrmService) {}

  @Get('summary')
  getSummary(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('storeId') storeId: string | undefined,
    @GetUser() actor: any,
  ) {
    return this.crmService.getSummary(companyId, actor, storeId);
  }

  @Get('customers')
  listCustomers(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query() query: CrmCustomersQueryDto,
    @GetUser() actor: any,
  ) {
    return this.crmService.listCustomers(companyId, actor, query);
  }

  @Get('customers/:customerId')
  getCustomerDetail(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Query('storeId') storeId: string | undefined,
    @GetUser() actor: any,
  ) {
    return this.crmService.getCustomerDetail(
      companyId,
      customerId,
      actor,
      storeId,
    );
  }

  @Patch('customers/:customerId/profile')
  updateCustomerProfile(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: UpdateCrmCustomerProfileDto,
    @GetUser() actor: any,
  ) {
    return this.crmService.updateCustomerProfile(
      companyId,
      customerId,
      dto,
      actor,
    );
  }

  @Post('customers/:customerId/notes')
  addCustomerNote(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCrmCustomerNoteDto,
    @GetUser() actor: any,
  ) {
    return this.crmService.addCustomerNote(companyId, customerId, dto, actor);
  }

  @Get('offers/config')
  getOffersConfig(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @GetUser() actor: any,
  ) {
    return this.crmService.getOffersConfig(companyId, actor);
  }

  @Post('customers/:customerId/offers')
  createTargetedOffer(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('customerId', ParseUUIDPipe) customerId: string,
    @Body() dto: CreateCrmTargetedOfferDto,
    @GetUser() actor: any,
  ) {
    return this.crmService.createTargetedOffer(
      companyId,
      customerId,
      dto,
      actor,
    );
  }

  @Get('offers')
  listOffers(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('storeId') storeId: string | undefined,
    @Query('status') status: CrmOfferStatus | undefined,
    @GetUser() actor: any,
  ) {
    return this.crmService.listOffers(companyId, actor, storeId, status);
  }

  @Patch('offers/:offerId/cancel')
  cancelOffer(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
    @GetUser() actor: any,
  ) {
    return this.crmService.cancelOffer(companyId, offerId, actor);
  }
}

@Controller('crm-offers')
export class CrmOfferPublicController {
  constructor(private readonly crmService: CompanyCrmService) {}

  @Get('resolve/:offerCode')
  @UseGuards(OptionalJwtAuthGuard)
  resolveOffer(
    @Param('offerCode') offerCode: string,
    @GetUser() user?: any,
  ) {
    return this.crmService.resolveOfferByCode(offerCode, user?.id);
  }

  @Get('redirect/:offerCode')
  @Header('Content-Type', 'text/html; charset=utf-8')
  redirectOffer(@Param('offerCode') offerCode: string) {
    return this.crmService.buildOfferRedirectHtml(offerCode);
  }
}
