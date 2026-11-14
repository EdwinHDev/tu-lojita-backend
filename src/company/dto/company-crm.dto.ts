import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export type CrmSegmentKey =
  | 'VIP'
  | 'FREQUENT'
  | 'NEW'
  | 'AT_RISK'
  | 'WITH_DEBT'
  | 'BLOCKED'
  | 'WISHLIST';

export class CrmCustomersQueryDto {
  @IsOptional()
  @IsUUID()
  storeId?: string;

  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['VIP', 'FREQUENT', 'NEW', 'AT_RISK', 'WITH_DEBT', 'BLOCKED', 'WISHLIST'])
  segment?: CrmSegmentKey;

  @IsOptional()
  @IsIn(['ltv', 'ordersCount', 'lastOrderAt', 'debt', 'favoritesCount', 'rating'])
  sortBy?: 'ltv' | 'ordersCount' | 'lastOrderAt' | 'debt' | 'favoritesCount' | 'rating';

  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 25;
}

export class UpdateCrmCustomerProfileDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsIn(['WHATSAPP', 'CALL', 'IN_APP'])
  preferredChannel?: 'WHATSAPP' | 'CALL' | 'IN_APP';

  @IsOptional()
  @IsDateString()
  lastContactAt?: string | null;

  @IsOptional()
  @IsDateString()
  nextFollowUpAt?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  nextFollowUpNote?: string | null;

  @IsOptional()
  @IsBoolean()
  isFollowUpCompleted?: boolean;

  @IsOptional()
  @IsBoolean()
  markContactedNow?: boolean;
}

export class CreateCrmCustomerNoteDto {
  @IsString()
  @MaxLength(2000)
  content: string;

  @IsOptional()
  @IsIn(['GENERAL', 'FOLLOW_UP', 'PAYMENT', 'VIP', 'ALERT'])
  category?: 'GENERAL' | 'FOLLOW_UP' | 'PAYMENT' | 'VIP' | 'ALERT';
}

export class CreateCrmTargetedOfferDto {
  @IsUUID()
  itemId: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  offerPrice: number;

  @Type(() => Number)
  @IsInt()
  @IsIn([6, 12, 24, 48, 72])
  durationHours: 6 | 12 | 24 | 48 | 72;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  paymentMethod?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  paymentReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  messageToCustomer?: string;
}
