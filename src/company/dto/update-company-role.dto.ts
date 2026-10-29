import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyRoleDto } from './create-company-role.dto';

export class UpdateCompanyRoleDto extends PartialType(CreateCompanyRoleDto) {}
