import { Controller, Get, Param, Post } from '@nestjs/common';
import { FavoriteService } from './favorite.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';

@Controller('favorites')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  /**
   * POST /favorites/:itemId/toggle
   * Alternar favorito de un artículo para el usuario autenticado.
   */
  @Auth()
  @Post(':itemId/toggle')
  toggleFavorite(@Param('itemId') itemId: string, @GetUser() user: User) {
    return this.favoriteService.toggleFavorite(user.id, itemId);
  }

  /**
   * POST /favorites/:itemId
   * Alias de toggle para flexibilidad de clientes.
   */
  @Auth()
  @Post(':itemId')
  toggleFavoriteAlias(@Param('itemId') itemId: string, @GetUser() user: User) {
    return this.favoriteService.toggleFavorite(user.id, itemId);
  }

  /**
   * GET /favorites
   * Listar todos los favoritos del usuario con datos en tiempo real y detección de rebajas.
   */
  @Auth()
  @Get()
  getUserFavorites(@GetUser() user: User) {
    return this.favoriteService.getUserFavorites(user.id);
  }

  /**
   * GET /favorites/ids
   * Obtener arreglo de IDs de artículos en favoritos del usuario.
   */
  @Auth()
  @Get('ids')
  getUserFavoriteItemIds(@GetUser() user: User) {
    return this.favoriteService.getUserFavoriteItemIds(user.id);
  }

  /**
   * GET /favorites/check/:itemId
   * Verificar si un artículo específico está marcado como favorito.
   */
  @Auth()
  @Get('check/:itemId')
  checkFavorite(@Param('itemId') itemId: string, @GetUser() user: User) {
    return this.favoriteService.isItemFavorite(user.id, itemId);
  }
}
