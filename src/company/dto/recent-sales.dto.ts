export class RecentSaleDto {
  id: string;
  storeName: string;
  amount: number;
  currency: string;
  time: string;
  orderId: string;
  status: string;
}

export class RecentSalesResponseDto {
  recentSales: RecentSaleDto[];
  total: number;
}
