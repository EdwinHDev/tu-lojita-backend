import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

export class ConfirmAccountDeletionDto {
  @IsString()
  @IsNotEmpty({ message: 'El token de eliminación es requerido.' })
  deletionToken: string;

  @IsString()
  @Length(6, 6, { message: 'El código OTP debe tener exactamente 6 dígitos.' })
  otp: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

