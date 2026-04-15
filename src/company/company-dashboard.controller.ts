import { Controller, Get, Param, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { CompanyDashboardService } from './company-dashboard.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { DashboardStatsDto } from './dto/dashboard-stats.dto';
import { RecentSalesResponseDto } from './dto/recent-sales.dto';
import { StoresSummaryResponseDto } from './dto/stores-summary.dto';
import { CompanyStoresResponseDto } from './dto/company-stores.dto';

@Controller('companies/:companyId/dashboard')
@Auth() // Requiere autenticación
export class CompanyDashboardController {
  constructor(
    private readonly dashboardService: CompanyDashboardService,
  ) {}

  /**
   * GET /api/v1/companies/:companyId/dashboard/stats
   * Obtener estadísticas generales del dashboard
   */
  @Get('stats')
  async getStats(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ): Promise<DashboardStatsDto> {
    return this.dashboardService.getDashboardStats(companyId, user.id);
  }

  /**
   * GET /api/v1/companies/:companyId/dashboard/recent-sales?limit=5
   * Obtener ventas recientes
   */
  @Get('recent-sales')
  async getRecentSales(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
    @Query('limit', new DefaultValuePipe(5), ParseIntPipe) limit: number,
  ): Promise<RecentSalesResponseDto> {
    return this.dashboardService.getRecentSales(companyId, user.id, limit);
  }

  /**
   * GET /api/v1/companies/:companyId/dashboard/stores-summary
   * Obtener resumen de tiendas con cantidad de productos
   */
  @Get('stores-summary')
  async getStoresSummary(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ): Promise<StoresSummaryResponseDto> {
    return this.dashboardService.getStoresSummary(companyId, user.id);
  }

  /**
   * GET /api/v1/companies/:companyId/dashboard/stores
   * Obtener todas las tiendas de la empresa con estadísticas detalladas
   */
  @Get('stores')
  async getCompanyStores(
    @Param('companyId') companyId: string,
    @GetUser() user: User,
  ): Promise<CompanyStoresResponseDto> {
    return this.dashboardService.getCompanyStores(companyId, user.id);
  }
}
