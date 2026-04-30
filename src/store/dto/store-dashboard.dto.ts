import { RecentSaleDto } from 'src/company/dto/recent-sales.dto';

export class StoreDashboardDto {
  stats: {
    salesToday: {
      amount: number;
      currency: string;
    };
    totalItems: number;
    totalCategories: number;
    totalCustomers: number;
  };
  recentSales: RecentSaleDto[];
}
