import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Company } from './entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { Item } from 'src/item/entities/item.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentSalesResponseDto, RecentSaleDto } from './dto/recent-sales.dto';
import {
  StoresSummaryResponseDto,
  StoreSummaryDto,
} from './dto/stores-summary.dto';
import {
  CompanyStoresResponseDto,
  CompanyStoreDto,
} from './dto/company-stores.dto';
import { OrderStatus } from 'src/order/types';
import {
  getStartOfTodayInTimezone,
  getStartOfMonthInTimezone,
  formatTimeInTimezone,
} from 'src/common/utils/timezone.utils';

import {
  DashboardAnalyticsQueryDto,
  DashboardAnalyticsResponseDto,
  DashboardPeriod,
  PaymentMethodShareDto,
  SalesChartPointDto,
  StorePerformanceDto,
  TopProductDto,
} from './dto/dashboard-analytics.dto';
import { Payment } from 'src/payment/entities/payment.entity';
import { OrderItem } from 'src/order-item/entities/order-item.entity';
import { PaymentStatus } from 'src/payment/types/payment-status.enum';

@Injectable()
export class CompanyDashboardService {
  constructor(
    @InjectRepository(Company)
    private readonly companyRepository: Repository<Company>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,
    @InjectRepository(OrderItem)
    private readonly orderItemRepository: Repository<OrderItem>,
  ) {}

  /**
   * Validar que el usuario pertenece a la empresa
   */
  private async validateUserCompany(
    userId: string,
    companyId: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Verificar que la empresa existe y que el usuario es el owner
    const company = await this.companyRepository.findOne({
      where: {
        id: companyId,
        owner: { id: userId },
      },
    });

    if (!company) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }
  }

  /**
   * Obtener estadísticas del dashboard
   */
  async getDashboardStats(
    companyId: string,
    userId: string,
  ): Promise<DashboardStatsDto> {
    await this.validateUserCompany(userId, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const storeIds = company.stores.map((store) => store.id);

    // Si no hay tiendas, retornar estadísticas en 0
    if (storeIds.length === 0) {
      return {
        salesToday: {
          amount: 0,
          percentage: 0,
          currency: 'USD',
        },
        totalStores: {
          count: 0,
          newThisMonth: 0,
        },
        totalProducts: {
          count: 0,
          addedThisWeek: 0,
        },
        totalCustomers: {
          count: 0,
          newThisMonth: 0,
        },
      };
    }

    // Calcular fechas según la zona horaria de la primera tienda o Caracas por defecto
    const timezone = company.stores[0]?.timezone || 'America/Caracas';
    const startOfToday = getStartOfTodayInTimezone(new Date(), timezone);
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfToday.getDate() - 7);

    const startOfMonth = getStartOfMonthInTimezone(new Date(), timezone);

    // 1. Ventas de hoy (incluye órdenes pagadas total o parcialmente)
    const salesToday = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.finalAmount)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .andWhere('order.createdAt >= :startOfToday', {
        startOfToday: startOfToday.toISOString(),
      })
      .getRawOne<{ total: string | null }>();

    // Ventas de ayer para calcular porcentaje
    const salesYesterday = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.finalAmount)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .andWhere(
        'order.createdAt >= :startOfYesterday AND order.createdAt < :startOfToday',
        {
          startOfYesterday: startOfYesterday.toISOString(),
          startOfToday: startOfToday.toISOString(),
        },
      )
      .getRawOne<{ total: string | null }>();

    const salesTodayAmount = parseFloat(salesToday?.total || '0');
    const salesYesterdayAmount = parseFloat(salesYesterday?.total || '0');
    const salesPercentage =
      salesYesterdayAmount > 0
        ? ((salesTodayAmount - salesYesterdayAmount) / salesYesterdayAmount) *
          100
        : 0;

    // 2. Total de tiendas
    const totalStores = company.stores.length;
    const newStoresThisMonth = await this.storeRepository.count({
      where: {
        company: { id: companyId },
        createdAt: MoreThanOrEqual(startOfMonth),
      },
    });

    // 3. Total de productos
    const totalProducts = await this.itemRepository.count({
      where: { store: { company: { id: companyId } } },
    });

    const newProductsThisWeek = await this.itemRepository.count({
      where: {
        store: { company: { id: companyId } },
        createdAt: MoreThanOrEqual(startOfWeek),
      },
    });

    // 4. Total de clientes (usuarios únicos que han hecho órdenes con pago)
    const customersQuery = await this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.userId)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .getRawOne<{ total: string | null }>();

    const newCustomersThisMonth = await this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.userId)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .getRawOne<{ total: string | null }>();

    return {
      salesToday: {
        amount: Math.round(salesTodayAmount * 100) / 100,
        percentage: Math.round(salesPercentage * 10) / 10,
        currency: 'USD',
      },
      totalStores: {
        count: totalStores,
        newThisMonth: newStoresThisMonth,
      },
      totalProducts: {
        count: totalProducts,
        addedThisWeek: newProductsThisWeek,
      },
      totalCustomers: {
        count: parseInt(customersQuery?.total || '0'),
        newThisMonth: parseInt(newCustomersThisMonth?.total || '0'),
      },
    };
  }

  /**
   * Obtener ventas recientes
   */
  async getRecentSales(
    companyId: string,
    userId: string,
    limit: number = 5,
  ): Promise<RecentSalesResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const storeIds = company.stores.map((store) => store.id);

    // Si no hay tiendas, retornar array vacío
    if (storeIds.length === 0) {
      return {
        recentSales: [],
        total: 0,
      };
    }

    const orders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
      })
      .orderBy('order.createdAt', 'DESC')
      .take(limit)
      .getMany();

    const recentSales: RecentSaleDto[] = orders.map((order) => {
      const timezone = order.store?.timezone || 'America/Caracas';

      return {
        id: order.id,
        storeName: order.store.name,
        amount: parseFloat(order.finalAmount.toString()),
        currency: 'USD',
        time: formatTimeInTimezone(new Date(order.createdAt), timezone),
        orderId: `#${order.id.substring(0, 8)}`,
        status: order.status,
      };
    });

    return {
      recentSales,
      total: recentSales.length,
    };
  }

  /**
   * Obtener resumen de tiendas
   */
  async getStoresSummary(
    companyId: string,
    userId: string,
  ): Promise<StoresSummaryResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const stores = await this.storeRepository.find({
      where: { company: { id: companyId } },
      relations: ['items', 'addresses'],
      order: { createdAt: 'DESC' },
    });

    const storesSummary: StoreSummaryDto[] = stores.map((store) => ({
      id: store.id,
      name: store.name,
      branchName: store.branchName,
      productsCount: store.items?.length || 0,
      address: store.addresses?.[0]?.address || undefined,
      logo: store.logo,
    }));

    return {
      stores: storesSummary,
      total: stores.length,
    };
  }

  /**
   * Obtener tiendas de la empresa con estadísticas
   */
  async getCompanyStores(
    companyId: string,
    userId: string,
  ): Promise<CompanyStoresResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const stores = await this.storeRepository.find({
      where: { company: { id: companyId } },
      relations: ['items', 'addresses'],
      order: { createdAt: 'DESC' },
    });

    const companyStores: CompanyStoreDto[] = await Promise.all(
      stores.map(async (store) => {
        const timezone = store.timezone || 'America/Caracas';
        const storeStartOfToday = getStartOfTodayInTimezone(
          new Date(),
          timezone,
        );

        // Calcular ventas de hoy para esta tienda
        const salesToday = await this.orderRepository
          .createQueryBuilder('order')
          .select('SUM(order.finalAmount)', 'total')
          .where('order.storeId = :storeId', { storeId: store.id })
          .andWhere('order.status IN (:...statuses)', {
            statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
          })
          .andWhere('order.createdAt >= :startOfToday', {
            startOfToday: storeStartOfToday.toISOString(),
          })
          .getRawOne<{ total: string | null }>();

        return {
          id: store.id,
          name: store.name,
          branchName: store.branchName,
          address: store.addresses?.[0]?.address || undefined,
          logo: store.logo,
          status: store.status,
          productsCount: store.items?.length || 0,
          salesToday: parseFloat(salesToday?.total || '0'),
          currency: 'USD',
        };
      }),
    );

    return {
      stores: companyStores,
      total: stores.length,
    };
  }

  /**
   * Obtener analítica integral en tiempo real con filtros de fecha y sucursal
   */
  async getAnalytics(
    companyId: string,
    userId: string,
    queryDto: DashboardAnalyticsQueryDto,
  ): Promise<DashboardAnalyticsResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    let targetStores: Store[] = company.stores || [];
    if (queryDto.storeId && queryDto.storeId !== 'all') {
      targetStores = targetStores.filter((s) => s.id === queryDto.storeId);
      if (targetStores.length === 0) {
        throw new NotFoundException('Sucursal no encontrada en esta empresa');
      }
    }

    const targetStoreIds = targetStores.map((s) => s.id);
    const timezone = company.stores[0]?.timezone || 'America/Caracas';

    const period = queryDto.period || DashboardPeriod.MONTH;
    const now = new Date();

    let startDate: Date;
    let endDate: Date;
    let prevStartDate: Date;
    let prevEndDate: Date;

    if (period === DashboardPeriod.CUSTOM && queryDto.startDate && queryDto.endDate) {
      startDate = new Date(queryDto.startDate);
      endDate = new Date(queryDto.endDate);
      const duration = endDate.getTime() - startDate.getTime();
      prevStartDate = new Date(startDate.getTime() - duration);
      prevEndDate = new Date(startDate.getTime());
    } else if (period === DashboardPeriod.TODAY) {
      startDate = getStartOfTodayInTimezone(now, timezone);
      endDate = new Date(startDate.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === DashboardPeriod.WEEK) {
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 6 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === DashboardPeriod.SIX_MONTHS) {
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 180 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 180 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else if (period === DashboardPeriod.YEAR) {
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 365 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 365 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    } else {
      // Default: MONTH (30 days)
      const todayStart = getStartOfTodayInTimezone(now, timezone);
      startDate = new Date(todayStart.getTime() - 29 * 24 * 60 * 60 * 1000);
      endDate = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      prevStartDate = new Date(startDate.getTime() - 30 * 24 * 60 * 60 * 1000);
      prevEndDate = new Date(startDate.getTime() - 1);
    }

    if (targetStoreIds.length === 0) {
      return {
        period,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        storeId: queryDto.storeId || 'all',
        currency: 'USD',
        kpis: {
          totalSales: 0,
          totalCollected: 0,
          accountsReceivable: 0,
          totalOrders: 0,
          completedOrders: 0,
          pendingOrders: 0,
          averageTicket: 0,
          installmentRatio: {
            installmentOrdersCount: 0,
            singlePaymentOrdersCount: 0,
            installmentPercentage: 0,
            singlePaymentPercentage: 0,
          },
          growth: { salesGrowthPercentage: 0, ordersGrowthPercentage: 0 },
        },
        salesChart: [],
        storesPerformance: [],
        topProducts: [],
        paymentMethods: [],
      };
    }

    // 1. Órdenes del período actual
    const currentOrders = await this.orderRepository
      .createQueryBuilder('order')
      .leftJoinAndSelect('order.store', 'store')
      .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere('order.createdAt >= :startDate AND order.createdAt <= :endDate', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
      .orderBy('order.createdAt', 'ASC')
      .getMany();

    // 2. Órdenes del período anterior para calcular crecimiento
    const prevOrders = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere('order.createdAt >= :prevStartDate AND order.createdAt <= :prevEndDate', {
        prevStartDate: prevStartDate.toISOString(),
        prevEndDate: prevEndDate.toISOString(),
      })
      .getMany();

    const validCurrentOrders = currentOrders.filter(
      (o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED,
    );
    const validPrevOrders = prevOrders.filter(
      (o) => o.status !== OrderStatus.CANCELLED && o.status !== OrderStatus.REJECTED,
    );

    const totalSales = Math.round(
      validCurrentOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'), 0) * 100,
    ) / 100;

    const prevSales = Math.round(
      validPrevOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'), 0) * 100,
    ) / 100;

    // 3. Pagos efectivamente aprobados en el período
    const paymentsInRange = await this.paymentRepository
      .createQueryBuilder('payment')
      .where('payment.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere('payment.status = :status', { status: PaymentStatus.APPROVED })
      .andWhere('payment.createdAt >= :startDate AND payment.createdAt <= :endDate', {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      })
      .getMany();

    const totalCollected = Math.round(
      paymentsInRange.reduce((sum, p) => sum + parseFloat(p.amount?.toString() || '0'), 0) * 100,
    ) / 100;

    // 4. Cuentas por cobrar activas (saldo de compras en cuotas vigentes)
    const activeInstallmentOrders = await this.orderRepository
      .createQueryBuilder('order')
      .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
      .andWhere('order.isPartialPayment = true')
      .andWhere('order.status IN (:...statuses)', {
        statuses: [OrderStatus.PARTIALLY_PAID, OrderStatus.PENDING],
      })
      .getMany();

    const accountsReceivable = Math.round(
      activeInstallmentOrders.reduce((sum, o) => sum + parseFloat(o.remainingBalance?.toString() || '0'), 0) * 100,
    ) / 100;

    // 5. Métricas de órdenes y ratios
    const totalOrders = currentOrders.length;
    const completedOrders = currentOrders.filter((o) => o.status === OrderStatus.FULLY_PAID).length;
    const pendingOrders = currentOrders.filter(
      (o) => o.status === OrderStatus.PENDING || o.status === OrderStatus.PARTIALLY_PAID,
    ).length;

    const averageTicket = validCurrentOrders.length > 0
      ? Math.round((totalSales / validCurrentOrders.length) * 100) / 100
      : 0;

    const installmentOrdersCount = validCurrentOrders.filter((o) => o.isPartialPayment).length;
    const singlePaymentOrdersCount = validCurrentOrders.filter((o) => !o.isPartialPayment).length;
    const installmentPercentage = validCurrentOrders.length > 0
      ? Math.round((installmentOrdersCount / validCurrentOrders.length) * 1000) / 10
      : 0;
    const singlePaymentPercentage = validCurrentOrders.length > 0
      ? Math.round((singlePaymentOrdersCount / validCurrentOrders.length) * 1000) / 10
      : 0;

    const salesGrowthPercentage = prevSales > 0
      ? Math.round(((totalSales - prevSales) / prevSales) * 1000) / 10
      : (totalSales > 0 ? 100 : 0);

    const ordersGrowthPercentage = prevOrders.length > 0
      ? Math.round(((totalOrders - prevOrders.length) / prevOrders.length) * 1000) / 10
      : (totalOrders > 0 ? 100 : 0);

    // 6. Puntos del gráfico de ventas
    const salesChart: SalesChartPointDto[] = [];
    if (period === DashboardPeriod.TODAY) {
      // 12 puntos de 2 horas (00:00, 02:00, ...)
      for (let h = 0; h < 24; h += 2) {
        const bucketStart = new Date(startDate.getTime() + h * 60 * 60 * 1000);
        const bucketEnd = new Date(startDate.getTime() + (h + 2) * 60 * 60 * 1000);
        const bucketOrders = validCurrentOrders.filter(
          (o) => o.createdAt >= bucketStart && o.createdAt < bucketEnd,
        );
        const bucketSales = bucketOrders.reduce((s, o) => s + parseFloat(o.finalAmount?.toString() || '0'), 0);
        salesChart.push({
          label: `${h.toString().padStart(2, '0')}:00`,
          date: bucketStart.toISOString(),
          sales: Math.round(bucketSales * 100) / 100,
          ordersCount: bucketOrders.length,
        });
      }
    } else if (period === DashboardPeriod.SIX_MONTHS || period === DashboardPeriod.YEAR) {
      // Agrupación mensual
      const monthsMap = new Map<string, { label: string; sales: number; count: number }>();
      const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
      for (const o of validCurrentOrders) {
        const d = new Date(o.createdAt);
        const key = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear().toString().substring(2)}`;
        const existing = monthsMap.get(key) || { label, sales: 0, count: 0 };
        existing.sales += parseFloat(o.finalAmount?.toString() || '0');
        existing.count += 1;
        monthsMap.set(key, existing);
      }
      for (const [dateKey, val] of monthsMap.entries()) {
        salesChart.push({
          label: val.label,
          date: `${dateKey}-01`,
          sales: Math.round(val.sales * 100) / 100,
          ordersCount: val.count,
        });
      }
    } else {
      // Agrupación diaria (Días del período)
      const dayMap = new Map<string, { label: string; sales: number; count: number }>();
      const dayDiff = Math.max(1, Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const step = dayDiff > 31 ? Math.ceil(dayDiff / 15) : 1;

      for (let i = 0; i < dayDiff; i += step) {
        const d = new Date(startDate.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().split('T')[0];
        const dayNum = d.getDate();
        const monthNum = d.getMonth() + 1;
        dayMap.set(key, { label: `${dayNum}/${monthNum}`, sales: 0, count: 0 });
      }

      for (const o of validCurrentOrders) {
        const key = new Date(o.createdAt).toISOString().split('T')[0];
        if (dayMap.has(key)) {
          const entry = dayMap.get(key)!;
          entry.sales += parseFloat(o.finalAmount?.toString() || '0');
          entry.count += 1;
        }
      }

      for (const [k, v] of dayMap.entries()) {
        salesChart.push({
          label: v.label,
          date: k,
          sales: Math.round(v.sales * 100) / 100,
          ordersCount: v.count,
        });
      }
    }

    // 7. Rendimiento por Sucursal
    const storesPerformance: StorePerformanceDto[] = targetStores.map((st) => {
      const stOrders = validCurrentOrders.filter((o) => o.store?.id === st.id);
      const stSales = Math.round(
        stOrders.reduce((sum, o) => sum + parseFloat(o.finalAmount?.toString() || '0'), 0) * 100,
      ) / 100;
      const pct = totalSales > 0 ? Math.round((stSales / totalSales) * 1000) / 10 : 0;
      return {
        storeId: st.id,
        storeName: st.name + (st.branchName ? ` (${st.branchName})` : ''),
        totalSales: stSales,
        ordersCount: stOrders.length,
        percentageOfTotal: pct,
      };
    });
    storesPerformance.sort((a, b) => b.totalSales - a.totalSales);

    // 8. Top 5 Productos más vendidos
    let topProducts: TopProductDto[] = [];
    try {
      const topItemsRaw = await this.orderItemRepository
        .createQueryBuilder('oi')
        .innerJoin('oi.order', 'order')
        .leftJoin('oi.item', 'item')
        .select('oi.title', 'title')
        .addSelect('item.id', 'itemId')
        .addSelect('item.mainImage', 'mainImage')
        .addSelect('SUM(oi.quantity)', 'unitsSold')
        .addSelect('SUM(oi.price * oi.quantity)', 'totalRevenue')
        .where('order.storeId IN (:...targetStoreIds)', { targetStoreIds })
        .andWhere('order.status NOT IN (:...excluded)', {
          excluded: [OrderStatus.CANCELLED, OrderStatus.REJECTED],
        })
        .andWhere('order.createdAt >= :startDate AND order.createdAt <= :endDate', {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        })
        .groupBy('oi.title')
        .addGroupBy('item.id')
        .addGroupBy('item.mainImage')
        .orderBy('SUM(oi.quantity)', 'DESC')
        .limit(5)
        .getRawMany();

      topProducts = topItemsRaw.map((raw) => ({
        itemId: raw.itemId || '',
        title: raw.title || 'Producto',
        mainImage: raw.mainImage || null,
        unitsSold: parseInt(raw.unitsSold || '0', 10),
        totalRevenue: Math.round(parseFloat(raw.totalRevenue || '0') * 100) / 100,
      }));
    } catch {
      topProducts = [];
    }

    // 9. Distribución de Métodos de Pago
    const paymentMethodsMap = new Map<string, { label: string; amount: number; count: number }>();
    for (const p of paymentsInRange) {
      const m = p.paymentMethod || 'OTRO';
      let label = m;
      if (m === 'PAGO_MOVIL') label = 'Pago Móvil';
      else if (m === 'TRANSFER') label = 'Transferencia';
      else if (m === 'BINANCE') label = 'Binance Pay';
      else if (m === 'ZELLE') label = 'Zelle';

      const existing = paymentMethodsMap.get(m) || { label, amount: 0, count: 0 };
      existing.amount += parseFloat(p.amount?.toString() || '0');
      existing.count += 1;
      paymentMethodsMap.set(m, existing);
    }

    const paymentMethods: PaymentMethodShareDto[] = [];
    for (const [k, v] of paymentMethodsMap.entries()) {
      const amt = Math.round(v.amount * 100) / 100;
      const pct = totalCollected > 0 ? Math.round((amt / totalCollected) * 1000) / 10 : 0;
      paymentMethods.push({
        method: k,
        label: v.label,
        totalAmount: amt,
        percentage: pct,
        transactionCount: v.count,
      });
    }
    paymentMethods.sort((a, b) => b.totalAmount - a.totalAmount);

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      storeId: queryDto.storeId || 'all',
      currency: 'USD',
      kpis: {
        totalSales,
        totalCollected,
        accountsReceivable,
        totalOrders,
        completedOrders,
        pendingOrders,
        averageTicket,
        installmentRatio: {
          installmentOrdersCount,
          singlePaymentOrdersCount,
          installmentPercentage,
          singlePaymentPercentage,
        },
        growth: {
          salesGrowthPercentage,
          ordersGrowthPercentage,
        },
      },
      salesChart,
      storesPerformance,
      topProducts,
      paymentMethods,
    };
  }
}
