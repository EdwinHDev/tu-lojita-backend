import { EntityManager, In, Not } from 'typeorm';
import { Order } from '../entities/order.entity';
import { InstallmentStatus, OrderStatus } from '../types';
import { InstallmentPeriod } from 'src/store/types/installment-period.enum';
import { ItemPreorderConfig } from 'src/item/entities/item-preorder-config.entity';
import { DepositType } from 'src/item/types/deposit-type.enum';

export interface ScheduledInstallmentRow {
  amount: number;
  paidAmount: number;
  storePrincipalAmount: number;
  platformCommissionPortion: number;
  dueDate: Date | null;
  paymentDate: Date | null;
  status: InstallmentStatus;
}

export function addInstallmentInterval(
  fromDate: Date,
  value: number,
  unit: InstallmentPeriod,
): Date {
  const nextDate = new Date(fromDate.getTime());
  if (unit === InstallmentPeriod.DAYS) {
    nextDate.setDate(nextDate.getDate() + value);
  } else if (unit === InstallmentPeriod.WEEKS) {
    nextDate.setDate(nextDate.getDate() + value * 7);
  } else if (unit === InstallmentPeriod.MONTHS) {
    nextDate.setMonth(nextDate.getMonth() + value);
  } else {
    nextDate.setDate(nextDate.getDate() + value);
  }
  return nextDate;
}

export async function calculateActiveStoreDebt(
  manager: EntityManager,
  userId: string,
  storeId: string,
): Promise<number> {
  const activeOrders = await manager.find(Order, {
    where: {
      user: { id: userId },
      store: { id: storeId },
      isFullyPaid: false,
      status: Not(In([OrderStatus.CANCELLED, OrderStatus.FULLY_PAID])),
    },
  });

  const totalDebt = activeOrders.reduce((sum, order) => {
    const remaining = parseFloat((order.remainingBalance || 0).toString());
    return sum + (Number.isFinite(remaining) ? Math.max(0, remaining) : 0);
  }, 0);

  return Math.round(totalDebt * 100) / 100;
}

export function computePreorderLineDeposit(
  lineTotal: number,
  quantity: number,
  config?: ItemPreorderConfig | null,
): number {
  const cleanLineTotal = Math.round(lineTotal * 100) / 100;
  if (!config) {
    return cleanLineTotal;
  }

  const val = parseFloat((config.depositValue ?? 0).toString()) || 0;
  switch (config.depositType) {
    case DepositType.FREE:
      return 0;
    case DepositType.PERCENTAGE:
      return Math.round(((cleanLineTotal * val) / 100) * 100) / 100;
    case DepositType.FIXED_AMOUNT:
      return Math.min(
        cleanLineTotal,
        Math.round(val * quantity * 100) / 100,
      );
    case DepositType.FULL_PAYMENT:
    default:
      return cleanLineTotal;
  }
}

export function buildInstallmentScheduleRows(params: {
  finalAmount: number;
  commAmount: number;
  upfrontAmount: number;
  maxInstallments: number;
  now: Date;
  intervalValue: number;
  intervalUnit: InstallmentPeriod;
}): {
  isDeferredZeroInitial: boolean;
  orderNextDueDate: Date | null;
  orderStatus: OrderStatus;
  rows: ScheduledInstallmentRow[];
} {
  const {
    finalAmount,
    commAmount,
    upfrontAmount,
    maxInstallments,
    now,
    intervalValue,
    intervalUnit,
  } = params;

  const finalCents = Math.max(0, Math.round(finalAmount * 100));
  const upfrontCents = Math.max(
    0,
    Math.min(finalCents, Math.round(upfrontAmount * 100)),
  );
  const commCents = Math.max(0, Math.round(commAmount * 100));
  const safeMaxInst = Math.max(1, maxInstallments || 1);

  const isDeferredZeroInitial = upfrontCents === 0;
  const isUpfrontFull = finalCents > 0 && upfrontCents >= finalCents - 1;

  const amountsCents: number[] = [];

  if (isUpfrontFull || safeMaxInst === 1) {
    amountsCents.push(finalCents);
  } else {
    amountsCents.push(upfrontCents);
    const remainingCents = Math.max(0, finalCents - upfrontCents);
    const futureCount = safeMaxInst - 1;
    const baseFutureCents = Math.floor(remainingCents / futureCount);

    for (let i = 0; i < futureCount; i++) {
      const isLast = i === futureCount - 1;
      const cents = isLast
        ? remainingCents - baseFutureCents * (futureCount - 1)
        : baseFutureCents;
      amountsCents.push(cents);
    }
  }

  // Distribuir comisión proporcionalmente solo entre cuotas con monto > 0
  // para evitar comisiones en Cuota 1 = $0.00 o storePrincipalAmount negativos.
  const positiveIndices = amountsCents
    .map((cents, idx) => (cents > 0 ? idx : -1))
    .filter((idx) => idx >= 0);

  const commPerRowCents = new Array<number>(amountsCents.length).fill(0);
  if (commCents > 0 && positiveIndices.length > 0) {
    const positiveTotalCents = positiveIndices.reduce(
      (sum, idx) => sum + amountsCents[idx],
      0,
    );
    let assignedCommCents = 0;

    for (let k = 0; k < positiveIndices.length; k++) {
      const idx = positiveIndices[k];
      const isLastPositive = k === positiveIndices.length - 1;
      const shareCents = isLastPositive
        ? Math.max(0, commCents - assignedCommCents)
        : Math.min(
            amountsCents[idx],
            Math.round((commCents * amountsCents[idx]) / positiveTotalCents),
          );
      commPerRowCents[idx] = Math.min(amountsCents[idx], shareCents);
      assignedCommCents += commPerRowCents[idx];
    }
  }

  const installment2DueDate =
    isDeferredZeroInitial && amountsCents.length > 1
      ? addInstallmentInterval(now, intervalValue, intervalUnit)
      : null;

  const rows: ScheduledInstallmentRow[] = amountsCents.map((cents, idx) => {
    const amount = Math.round(cents) / 100;
    const platformCommissionPortion =
      Math.round(commPerRowCents[idx]) / 100;
    const storePrincipalAmount =
      Math.round(cents - commPerRowCents[idx]) / 100;

    if (idx === 0 && isDeferredZeroInitial) {
      return {
        amount: 0,
        paidAmount: 0,
        storePrincipalAmount: 0,
        platformCommissionPortion: 0,
        dueDate: now,
        paymentDate: now,
        status: InstallmentStatus.PAID,
      };
    }

    let dueDate: Date | null = null;
    if (idx === 0) {
      dueDate = now;
    } else if (idx === 1 && isDeferredZeroInitial) {
      dueDate = installment2DueDate;
    }

    return {
      amount,
      paidAmount: 0,
      storePrincipalAmount,
      platformCommissionPortion,
      dueDate,
      paymentDate: null,
      status: InstallmentStatus.PENDING,
    };
  });

  return {
    isDeferredZeroInitial,
    orderNextDueDate: isDeferredZeroInitial ? installment2DueDate : now,
    orderStatus: isDeferredZeroInitial
      ? OrderStatus.PARTIALLY_PAID
      : OrderStatus.PENDING,
    rows,
  };
}
