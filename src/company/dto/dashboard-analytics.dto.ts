import { IsEnum, IsOptional, IsString } from 'class-validator';

export enum DashboardPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  SIX_MONTHS = 'six_months',
  YEAR = 'year',
  CUSTOM = 'custom',
}

export class DashboardAnalyticsQueryDto {
  @IsOptional()
  @IsEnum(DashboardPeriod)
  period?: DashboardPeriod = DashboardPeriod.MONTH;

  @IsOptional()
  @IsString()
  storeId?: string = 'all';

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}

export class KpiMetricsDto {
  totalSales: number;
  totalCollected: number;
  accountsReceivable: number;
  totalOrders: number;
  completedOrders: number;
  pendingOrders: number;
  averageTicket: number;
  installmentRatio: {
    installmentOrdersCount: number;
    singlePaymentOrdersCount: number;
    installmentPercentage: number;
    singlePaymentPercentage: number;
  };
  growth: {
    salesGrowthPercentage: number;
    ordersGrowthPercentage: number;
  };
}

export class SalesChartPointDto {
  label: string;
  date: string;
  sales: number;
  ordersCount: number;
}

export class StorePerformanceDto {
  storeId: string;
  storeName: string;
  totalSales: number;
  ordersCount: number;
  percentageOfTotal: number;
}

export class TopProductDto {
  itemId: string;
  title: string;
  mainImage: string | null;
  unitsSold: number;
  totalRevenue: number;
}

export class PaymentMethodShareDto {
  method: string;
  label: string;
  totalAmount: number;
  percentage: number;
  transactionCount: number;
}

export class DashboardAnalyticsResponseDto {
  period: string;
  startDate: string;
  endDate: string;
  storeId: string;
  currency: string;
  kpis: KpiMetricsDto;
  salesChart: SalesChartPointDto[];
  storesPerformance: StorePerformanceDto[];
  topProducts: TopProductDto[];
  paymentMethods: PaymentMethodShareDto[];
}
