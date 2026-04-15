export class StoreSummaryDto {
  id: string;
  name: string;
  productsCount: number;
  address?: string;
  logo?: string;
}

export class StoresSummaryResponseDto {
  stores: StoreSummaryDto[];
  total: number;
}
