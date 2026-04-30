export class StoreSummaryDto {
  id: string;
  name: string;
  branchName?: string;
  productsCount: number;
  address?: string;
  logo?: string;
}

export class StoresSummaryResponseDto {
  stores: StoreSummaryDto[];
  total: number;
}
