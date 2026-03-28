import { IsBoolean, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';

export class CategoryQueryDto {
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === 'true' || value === true)
  inUse?: boolean;
}
