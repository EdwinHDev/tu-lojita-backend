export class CommissionMetricsResponseDto {
  today: number;
  thisWeek: number;
  thisMonth: number;
  thisYear: number;
  totalHistorical: number;

  collected: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    thisYear: number;
    totalHistorical: number;
  };

  pending: {
    unbilledDebt: number;
    billedPendingReview: number;
    totalReceivable: number;
    pendingStoresCount: number;
    pendingBillingsCount: number;
  };

  grossVolume: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    totalHistorical: number;
  };
}
