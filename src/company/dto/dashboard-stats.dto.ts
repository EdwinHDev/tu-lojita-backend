export class DashboardStatsDto {
  salesToday: {
    amount: number;
    percentage: number;
    currency: string;
  };

  totalStores: {
    count: number;
    newThisMonth: number;
  };

  totalProducts: {
    count: number;
    addedThisWeek: number;
  };

  totalCustomers: {
    count: number;
    newThisMonth: number;
  };
}
