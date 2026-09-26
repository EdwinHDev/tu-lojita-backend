import { IsNotEmpty, IsString } from 'class-validator';

export class UnregisterDeviceDto {
  @IsNotEmpty()
  @IsString()
  deviceId: string;
}
