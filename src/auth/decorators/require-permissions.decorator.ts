import { SetMetadata } from '@nestjs/common';
import { CompanyPermission } from 'src/company/types/company-permission.enum';

export const META_PERMISSIONS = 'permissions';

export const RequirePermissions = (
  ...permissions: (CompanyPermission | string)[]
) => SetMetadata(META_PERMISSIONS, permissions);
