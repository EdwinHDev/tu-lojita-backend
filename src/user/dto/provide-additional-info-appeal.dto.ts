import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ProvideAdditionalInfoAppealDto {
  @IsString()
  @IsNotEmpty({ message: 'Debes proporcionar una explicación o aclaración.' })
  additionalInfo: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  additionalEvidenceUrls?: string[];
}
