export class StoreSummaryDto {
  id: string;
  name: string;
  branchName?: string;
  hasMultipleBranches?: boolean;
  productsCount: number;
  address?: string;
  logo?: string;
  instagram?: string;
  tiktok?: string;
  phone?: string;
}

export class StoresSummaryResponseDto {
  stores: StoreSummaryDto[];
  total: number;
}
