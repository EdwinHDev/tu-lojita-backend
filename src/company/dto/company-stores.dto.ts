import { StoreStatus } from 'src/store/types/status.enum';

export class CompanyStoreDto {
  id: string;
  name: string;
  branchName?: string;
  address?: string;
  logo: string;
  status: StoreStatus;
  productsCount: number;
  hasMultipleBranches?: boolean;
  salesToday: number;
  currency: string;
  instagram?: string;
  tiktok?: string;
  phone?: string;
}

export class CompanyStoresResponseDto {
  stores: CompanyStoreDto[];
  total: number;
}
