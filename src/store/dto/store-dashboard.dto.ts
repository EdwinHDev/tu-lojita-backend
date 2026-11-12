import { RecentSaleDto } from 'src/company/dto/recent-sales.dto';

export class StorePendingOrderDto {
  id: string;
  orderId: string;
  customerName: string;
  amount: number;
  currency: string;
  time: string;
  status: string;
  itemTitle?: string;
  itemImageUrl?: string | null;
}

export class StoreDashboardDto {
  stats: {
    salesToday: {
      amount: number;
      percentage: number;
      currency: string;
    };
    totalItems: number;
    totalCategories: number;
    totalCustomers: number;
    pendingOrdersCount: number;
    openDisputesCount: number;
    commissionDebt: number;
    pendingCommissionReportsCount: number;
    activeStrikesCount: number;
    pendingMediationRequestsCount: number;
    paymentMethodsCount: number;
    aiEnabled: boolean;
  };
  recentSales: RecentSaleDto[];
  pendingOrders: StorePendingOrderDto[];
}
