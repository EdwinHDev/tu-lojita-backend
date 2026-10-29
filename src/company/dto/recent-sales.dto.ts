export class RecentSaleDto {
  id: string;
  storeName: string;
  amount: number;
  currency: string;
  time: string;
  orderId: string;
  status: string;
  itemTitle?: string;
  itemImageUrl?: string | null;
}

export class RecentSalesResponseDto {
  recentSales: RecentSaleDto[];
  total: number;
}
