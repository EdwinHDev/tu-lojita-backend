import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  Query,
  Headers,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { Auth } from 'src/auth/decorators/auth.decorator';
import { GetUser } from 'src/auth/decorators/get-user.decorator';
import { User } from 'src/user/entities/user.entity';
import { UserRole } from 'src/user/types';
import {
  CreateOrderReviewDto,
  UpdateOrderReviewDto,
  VendorReplyDto,
  CreateBuyerReviewDto,
  UpdateBuyerReviewDto,
  UpdateReviewVisibilityDto,
} from './dto/review.dto';

@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviewService: ReviewService) {}

  // ─── OrderReview ────────────────────────────────────────────────────────────

  /** POST /reviews/order/:orderId — Cliente crea reseña */
  @Auth()
  @Post('order/:orderId')
  createOrderReview(
    @Param('orderId') orderId: string,
    @GetUser() user: User,
    @Body() dto: CreateOrderReviewDto,
  ) {
    return this.reviewService.createOrderReview(orderId, user.id, dto);
  }

  /** PATCH /reviews/order/:reviewId — Cliente edita su reseña (ventana 3 días) */
  @Auth()
  @Patch('order/:reviewId')
  updateOrderReview(
    @Param('reviewId') reviewId: string,
    @GetUser() user: User,
    @Body() dto: UpdateOrderReviewDto,
  ) {
    return this.reviewService.updateOrderReview(reviewId, user.id, dto);
  }

  /** POST /reviews/order/:reviewId/reply — Vendedor responde a la reseña */
  @Auth()
  @Post('order/:reviewId/reply')
  addVendorReply(
    @Param('reviewId') reviewId: string,
    @GetUser() user: User,
    @Body() dto: VendorReplyDto,
  ) {
    return this.reviewService.addVendorReply(reviewId, user.id, dto);
  }

  /** POST /reviews/order/:reviewId/like — Dar o quitar 'Me Gusta' a una reseña */
  @Auth()
  @Post('order/:reviewId/like')
  toggleOrderReviewLike(
    @Param('reviewId') reviewId: string,
    @GetUser() user: User,
  ) {
    return this.reviewService.toggleOrderReviewLike(reviewId, user.id);
  }

  /** GET /reviews/order/item/:itemId — Reseñas de un ítem (público, paginado) */
  @Get('order/item/:itemId')
  getOrderReviews(
    @Param('itemId') itemId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Headers('authorization') authHeader?: string,
  ) {
    let currentUserId: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString('utf8'),
          );
          currentUserId = payload.sub;
        }
      } catch (_) {}
    }
    return this.reviewService.getOrderReviews(
      itemId,
      +page,
      +limit,
      currentUserId,
    );
  }

  /** GET /reviews/store/:storeId/summary — Resumen de calificación de una tienda (público) */
  @Get('store/:storeId/summary')
  getStoreReviewsSummary(@Param('storeId') storeId: string) {
    return this.reviewService.getStoreReviewsSummary(storeId);
  }

  /** GET /reviews/store/:storeId — Reseñas de una tienda (público, paginado) */
  @Get('store/:storeId')
  getStoreReviews(
    @Param('storeId') storeId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
    @Headers('authorization') authHeader?: string,
  ) {
    let currentUserId: string | undefined;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const parts = token.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(
            Buffer.from(parts[1], 'base64').toString('utf8'),
          );
          currentUserId = payload.sub;
        }
      } catch (_) {}
    }
    return this.reviewService.getStoreReviews(
      storeId,
      +page,
      +limit,
      currentUserId,
    );
  }

  /** GET /reviews/order/by-order/:orderId — Obtiene la reseña de una orden */
  @Auth()
  @Get('order/by-order/:orderId')
  getOrderReviewByOrder(
    @Param('orderId') orderId: string,
    @GetUser() user: User,
  ) {
    return this.reviewService.getOrderReviewByOrder(orderId, user.id);
  }

  // ─── BuyerReview ────────────────────────────────────────────────────────────

  /** POST /reviews/buyer/:orderId — Vendedor califica al comprador */
  @Auth()
  @Post('buyer/:orderId')
  createBuyerReview(
    @Param('orderId') orderId: string,
    @GetUser() user: User,
    @Body() dto: CreateBuyerReviewDto,
  ) {
    return this.reviewService.createBuyerReview(orderId, user.id, dto);
  }

  /** PATCH /reviews/buyer/:reviewId — Vendedor edita su calificación (ventana 3 días) */
  @Auth()
  @Patch('buyer/:reviewId')
  updateBuyerReview(
    @Param('reviewId') reviewId: string,
    @GetUser() user: User,
    @Body() dto: UpdateBuyerReviewDto,
  ) {
    return this.reviewService.updateBuyerReview(reviewId, user.id, dto);
  }

  /** GET /reviews/buyer/me — Historial de BuyerReview recibidas por el cliente */
  @Auth()
  @Get('buyer/me')
  getMyBuyerReviews(
    @GetUser() user: User,
    @Query('page') page = 1,
    @Query('limit') limit = 10,
  ) {
    return this.reviewService.getMyBuyerReviews(user.id, +page, +limit);
  }

  /** GET /reviews/buyer/by-order/:orderId — Obtiene la calificación al comprador de una orden */
  @Auth()
  @Get('buyer/by-order/:orderId')
  getBuyerReviewByOrder(@Param('orderId') orderId: string) {
    return this.reviewService.getBuyerReviewByOrder(orderId);
  }

  // ─── Moderación (solo Admin) ────────────────────────────────────────────────

  /** PATCH /reviews/order/:id/visibility — Admin oculta/muestra OrderReview */
  @Auth(UserRole.ADMIN)
  @Patch('order/:id/visibility')
  updateOrderReviewVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateReviewVisibilityDto,
  ) {
    return this.reviewService.updateOrderReviewVisibility(id, dto);
  }

  /** PATCH /reviews/buyer/:id/visibility — Admin oculta/muestra BuyerReview */
  @Auth(UserRole.ADMIN)
  @Patch('buyer/:id/visibility')
  updateBuyerReviewVisibility(
    @Param('id') id: string,
    @Body() dto: UpdateReviewVisibilityDto,
  ) {
    return this.reviewService.updateBuyerReviewVisibility(id, dto);
  }

  /** GET /reviews/all — Admin lista todas las reseñas */
  @Auth(UserRole.ADMIN)
  @Get('all')
  getAllReviews(
    @Query('type') type?: 'ORDER_REVIEW' | 'BUYER_REVIEW',
    @Query('isVisible') isVisible?: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    const visible = isVisible !== undefined ? isVisible === 'true' : undefined;
    return this.reviewService.getAllReviews(type, visible, +page, +limit);
  }
}
