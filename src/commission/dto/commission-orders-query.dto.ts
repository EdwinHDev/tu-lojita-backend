import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Min } from 'class-validator';

export class CommissionOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit debe ser un entero positivo' })
  @Min(1, { message: 'limit debe ser al menos 1' })
  limit?: number = 20;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'offset debe ser un entero mayor o igual a 0' })
  @Min(0, { message: 'offset no puede ser negativo' })
  offset?: number = 0;

  @IsOptional()
  @IsIn(['all', 'pending', 'collected', 'exempt'], {
    message: 'filter debe ser all, pending, collected o exempt',
  })
  filter?: 'all' | 'pending' | 'collected' | 'exempt' = 'all';
}
