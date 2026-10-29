import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CancelOrderDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  cancellationNotes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  refundNotes?: string;

  @IsOptional()
  @IsString()
  cancellationAction?: 'REFUND' | 'NO_REFUND';
}
