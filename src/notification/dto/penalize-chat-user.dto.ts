import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export enum ChatPenaltyTier {
  WARNING = 'WARNING',
  SUSPEND_72H = 'SUSPEND_72H',
  SUSPEND_15D = 'SUSPEND_15D',
  SUSPEND_30D = 'SUSPEND_30D',
  BAN_PERMANENT = 'BAN_PERMANENT',
}

export class PenalizeChatUserDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(ChatPenaltyTier, {
    message:
      'tier must be WARNING, SUSPEND_72H, SUSPEND_15D, SUSPEND_30D, or BAN_PERMANENT',
  })
  tier: ChatPenaltyTier;

  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  reason: string;

  @IsArray()
  @IsOptional()
  @IsString({ each: true })
  evidenceMessages?: string[];
}

export class LiftChatSuspensionDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;
}
