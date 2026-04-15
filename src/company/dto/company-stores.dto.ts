import { StoreStatus } from 'src/store/types/status.enum';

export class CompanyStoreDto {
  id: string;
  name: string;
  address?: string;
  logo: string;
  status: StoreStatus;
  productsCount: number;
  salesToday: number;
  currency: string;
}

export class CompanyStoresResponseDto {
  stores: CompanyStoreDto[];
  total: number;
}
