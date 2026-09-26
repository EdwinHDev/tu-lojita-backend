import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Query,
} from '@nestjs/common';
import { ReportService } from './report.service';
import { CreateReportDto } from './dto/create-report.dto';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { ReportPaginationDto } from './dto/report-pagination.dto';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';

@Auth()
@Controller(['reports', 'report'])
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Post()
  create(@Body() createReportDto: CreateReportDto, @GetUser() user: User) {
    return this.reportService.create(createReportDto, user);
  }

  @Get()
  findAll(@Query() paginationDto: ReportPaginationDto) {
    return this.reportService.findAll(paginationDto);
  }

  @Get('stores/:storeId/strikes')
  getStoreStrikes(@Param('storeId') storeId: string) {
    return this.reportService.getStoreStrikes(storeId);
  }

  @Get('my-reports')
  findMyReports(
    @GetUser() user: User,
    @Query() paginationDto: ReportPaginationDto,
  ) {
    return this.reportService.findMyReports(user.id, paginationDto);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @GetUser() user: User) {
    return this.reportService.findOne(id, user);
  }

  @Patch(':id/resolve')
  resolve(
    @Param('id') id: string,
    @Body() resolveReportDto: ResolveReportDto,
    @GetUser() user: User,
  ) {
    return this.reportService.resolve(id, resolveReportDto, user);
  }
}
