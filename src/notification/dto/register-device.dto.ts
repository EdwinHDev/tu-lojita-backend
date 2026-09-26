import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsNotEmpty()
  @IsString()
  fcmToken: string;

  @IsOptional()
  @IsString()
  platform?: string;

  @IsNotEmpty()
  @IsString()
  deviceId: string;
}
