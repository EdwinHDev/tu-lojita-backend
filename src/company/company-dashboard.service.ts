import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, MoreThanOrEqual, In } from 'typeorm';
import { Company } from './entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { Item } from 'src/item/entities/item.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentSalesResponseDto, RecentSaleDto } from './dto/recent-sales.dto';
import { StoresSummaryResponseDto, StoreSummaryDto } from './dto/stores-summary.dto';
import { CompanyStoresResponseDto, CompanyStoreDto } from './dto/company-stores.dto';
import { OrderStatus } from 'src/order/types';

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
  ) {}

  /**
   * Validar que el usuario pertenece a la empresa
   */
  private async validateUserCompany(userId: string, companyId: string): Promise<void> {
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
        owner: { id: userId }
      },
    });

    if (!company) {
      throw new ForbiddenException('No tienes acceso a esta empresa');
    }
  }

  /**
   * Obtener estadísticas del dashboard
   */
  async getDashboardStats(companyId: string, userId: string): Promise<DashboardStatsDto> {
    await this.validateUserCompany(userId, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const storeIds = company.stores.map(store => store.id);

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

    // Calcular fechas
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - 7);
    
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // 1. Ventas de hoy (incluye órdenes pagadas total o parcialmente)
    const salesToday = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.finalAmount)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', { 
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID] 
      })
      .andWhere('order.createdAt >= :startOfToday', { startOfToday: startOfToday.toISOString() })
      .getRawOne();

    // Ventas de ayer para calcular porcentaje
    const salesYesterday = await this.orderRepository
      .createQueryBuilder('order')
      .select('SUM(order.finalAmount)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', { 
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID] 
      })
      .andWhere('order.createdAt >= :startOfYesterday', { startOfYesterday: startOfYesterday.toISOString() })
      .andWhere('order.createdAt < :startOfToday', { startOfToday: startOfToday.toISOString() })
      .getRawOne();

    const salesTodayAmount = parseFloat(salesToday?.total || '0');
    const salesYesterdayAmount = parseFloat(salesYesterday?.total || '0');
    const salesPercentage = salesYesterdayAmount > 0 
      ? ((salesTodayAmount - salesYesterdayAmount) / salesYesterdayAmount) * 100 
      : 0;

    // 2. Total de tiendas
    const totalStores = company.stores.length;
    const newStoresThisMonth = await this.storeRepository.count({
      where: {
        company: { id: companyId },
        createdAt: MoreThanOrEqual(startOfMonth.toISOString()),
      },
    });

    // 3. Total de productos
    const totalProducts = await this.itemRepository.count({
      where: { store: { company: { id: companyId } } },
    });

    const newProductsThisWeek = await this.itemRepository.count({
      where: {
        store: { company: { id: companyId } },
        createdAt: MoreThanOrEqual(startOfWeek.toISOString()),
      },
    });

    // 4. Total de clientes (usuarios únicos que han hecho órdenes con pago)
    const customersQuery = await this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.userId)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', { 
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID] 
      })
      .getRawOne();

    const newCustomersThisMonth = await this.orderRepository
      .createQueryBuilder('order')
      .select('COUNT(DISTINCT order.userId)', 'total')
      .where('order.storeId IN (:...storeIds)', { storeIds })
      .andWhere('order.status IN (:...statuses)', { 
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID] 
      })
      .andWhere('order.createdAt >= :startOfMonth', { startOfMonth: startOfMonth.toISOString() })
      .getRawOne();

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
  async getRecentSales(companyId: string, userId: string, limit: number = 5): Promise<RecentSalesResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const company = await this.companyRepository.findOne({
      where: { id: companyId },
      relations: ['stores'],
    });

    if (!company) {
      throw new NotFoundException('Empresa no encontrada');
    }

    const storeIds = company.stores.map(store => store.id);

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
        statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID] 
      })
      .orderBy('order.createdAt', 'DESC')
      .take(limit)
      .getMany();

    const recentSales: RecentSaleDto[] = orders.map(order => {
      const orderDate = new Date(order.createdAt);
      const hours = orderDate.getHours().toString().padStart(2, '0');
      const minutes = orderDate.getMinutes().toString().padStart(2, '0');
      const ampm = orderDate.getHours() >= 12 ? 'PM' : 'AM';
      const displayHours = orderDate.getHours() % 12 || 12;

      return {
        id: order.id,
        storeName: order.store.name,
        amount: parseFloat(order.finalAmount.toString()),
        currency: 'USD',
        time: `${displayHours}:${minutes} ${ampm}`,
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
  async getStoresSummary(companyId: string, userId: string): Promise<StoresSummaryResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const stores = await this.storeRepository.find({
      where: { company: { id: companyId } },
      relations: ['items', 'addresses'],
      order: { createdAt: 'DESC' },
    });

    const storesSummary: StoreSummaryDto[] = stores.map(store => ({
      id: store.id,
      name: store.name,
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
  async getCompanyStores(companyId: string, userId: string): Promise<CompanyStoresResponseDto> {
    await this.validateUserCompany(userId, companyId);

    const stores = await this.storeRepository.find({
      where: { company: { id: companyId } },
      relations: ['items', 'addresses'],
      order: { createdAt: 'DESC' },
    });

    // Calcular fecha de inicio del día
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const companyStores: CompanyStoreDto[] = await Promise.all(
      stores.map(async (store) => {
        // Calcular ventas de hoy para esta tienda
        const salesToday = await this.orderRepository
          .createQueryBuilder('order')
          .select('SUM(order.finalAmount)', 'total')
          .where('order.storeId = :storeId', { storeId: store.id })
          .andWhere('order.status IN (:...statuses)', {
            statuses: [OrderStatus.FULLY_PAID, OrderStatus.PARTIALLY_PAID],
          })
          .andWhere('order.createdAt >= :startOfToday', { startOfToday: startOfToday.toISOString() })
          .getRawOne();

        return {
          id: store.id,
          name: store.name,
          address: store.addresses?.[0]?.address || undefined,
          logo: store.logo,
          status: store.status,
          productsCount: store.items?.length || 0,
          salesToday: parseFloat(salesToday?.total || '0'),
          currency: 'USD',
        };
      })
    );

    return {
      stores: companyStores,
      total: stores.length,
    };
  }
}
