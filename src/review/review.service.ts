import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OrderReview } from './entities/order-review.entity';
import { BuyerReview } from './entities/buyer-review.entity';
import { Order } from 'src/order/entities/order.entity';
import { Item } from 'src/item/entities/item.entity';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { NotificationService } from 'src/notification/notification.service';
import { NotificationType } from 'src/notification/entities/notification.entity';
import {
  CreateOrderReviewDto,
  UpdateOrderReviewDto,
  VendorReplyDto,
  CreateBuyerReviewDto,
  UpdateBuyerReviewDto,
  UpdateReviewVisibilityDto,
} from './dto/review.dto';
import { RankingService } from 'src/ranking/services/ranking.service';
import { RankingEventType } from 'src/ranking/types';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    @InjectRepository(OrderReview)
    private readonly orderReviewRepository: Repository<OrderReview>,
    @InjectRepository(BuyerReview)
    private readonly buyerReviewRepository: Repository<BuyerReview>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,
    private readonly notificationService: NotificationService,
    private readonly dataSource: DataSource,
    private readonly rankingService: RankingService,
  ) {}

  // ─── OrderReview ────────────────────────────────────────────────────────────

  /**
   * Crea una OrderReview para una orden completada. El cliente solo puede crear
   * una reseña por orden. Recalcula el promedio del ítem en la misma transacción.
   */
  async createOrderReview(
    orderId: string,
    userId: string,
    dto: CreateOrderReviewDto,
  ): Promise<OrderReview> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['user', 'store', 'store.owner', 'orderItems', 'orderItems.item'],
    });

    if (!order) throw new NotFoundException(`Orden ${orderId} no encontrada`);
    if (order.status !== OrderStatus.FULLY_PAID) {
      throw new ForbiddenException('Solo se pueden calificar órdenes completamente pagadas');
    }
    if (order.user?.id !== userId) {
      throw new ForbiddenException('Solo el comprador de la orden puede dejar una reseña');
    }

    const existing = await this.orderReviewRepository.findOne({ where: { orderId } });
    if (existing) {
      throw new ConflictException('Ya existe una reseña para esta orden');
    }

    const review = await this.dataSource.transaction(async (manager) => {
      const newReview = manager.create(OrderReview, {
        orderId,
        authorId: userId,
        rating: dto.rating,
        comment: dto.comment,
        imageUrls: dto.imageUrls ?? [],
        isVisible: true,
      });
      const saved = await manager.save(OrderReview, newReview);

      // Recalcular promedio del ítem principal de la orden
      await this.recalcItemRating(manager, order);

      return saved;
    });

    // Notificar al vendedor
    if (order.store?.owner?.id) {
      await this.notificationService.create({
        userId: order.store.owner.id,
        title: '⭐ Nueva reseña recibida',
        body: `Un cliente calificó su orden con ${dto.rating} estrellas.`,
        type: NotificationType.ORDER_REVIEW_RECEIVED,
        targetId: orderId,
        orderId,
      });
    }
    // Hook Ranking LP según la calificación recibida
    try {
      if (order.store?.id) {
        let rankingEventType: RankingEventType | null = null;
        if (dto.rating === 5) rankingEventType = RankingEventType.REVIEW_5_STAR;
        else if (dto.rating === 4) rankingEventType = RankingEventType.REVIEW_4_STAR;
        else if (dto.rating <= 2) rankingEventType = RankingEventType.REVIEW_1_2_STAR;

        if (rankingEventType) {
          await this.rankingService.processEvent(
            order.store.id,
            rankingEventType,
            review.id,
            userId,
          );
        }
      }
    } catch (rankErr) {
      this.logger.error(`Error processing ranking review event: ${rankErr.message}`);
    }

    return review;
  }

  /**
   * Actualiza una OrderReview si la ventana de 3 días está activa.
   */
  async updateOrderReview(
    reviewId: string,
    userId: string,
    dto: UpdateOrderReviewDto,
  ): Promise<OrderReview> {
    const review = await this.orderReviewRepository.findOne({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Reseña no encontrada');
    if (review.authorId !== userId) throw new ForbiddenException('No autorizado');
    if (Date.now() - review.createdAt.getTime() > THREE_DAYS_MS) {
      throw new ForbiddenException('La ventana de edición de 3 días ha expirado');
    }

    const order = await this.orderRepository.findOne({
      where: { id: review.orderId },
      relations: ['orderItems', 'orderItems.item'],
    });

    return this.dataSource.transaction(async (manager) => {
      if (dto.rating !== undefined) review.rating = dto.rating;
      if (dto.comment !== undefined) review.comment = dto.comment;
      if (dto.imageUrls !== undefined) review.imageUrls = dto.imageUrls;
      const saved = await manager.save(OrderReview, review);
      if (order) await this.recalcItemRating(manager, order);
      return saved;
    });
  }

  /**
   * Agrega la única respuesta del vendedor a una OrderReview.
   */
  async addVendorReply(
    reviewId: string,
    vendorUserId: string,
    dto: VendorReplyDto,
  ): Promise<OrderReview> {
    const review = await this.orderReviewRepository.findOne({
      where: { id: reviewId },
    });
    if (!review) throw new NotFoundException('Reseña no encontrada');
    if (review.vendorReply) throw new ConflictException('Ya existe una respuesta para esta reseña');

    // Verificar que el usuario es dueño de la tienda asociada a la orden
    const order = await this.orderRepository.findOne({
      where: { id: review.orderId },
      relations: ['store', 'store.owner', 'user'],
    });
    if (!order) throw new NotFoundException('Orden no encontrada');
    if (order.store?.owner?.id !== vendorUserId) {
      throw new ForbiddenException('Solo el dueño de la tienda puede responder la reseña');
    }

    review.vendorReply = dto.reply;
    review.vendorRepliedAt = new Date();
    const saved = await this.orderReviewRepository.save(review);

    // Notificar al cliente autor de la reseña
    if (review.authorId) {
      await this.notificationService.create({
        userId: review.authorId,
        title: '💬 El vendedor respondió tu reseña',
        body: `El vendedor respondió a tu calificación de la orden.`,
        type: NotificationType.ORDER_REVIEW_REPLIED,
        targetId: review.orderId,
        orderId: review.orderId,
      });
    }
    // Hook Ranking LP por responder reseña
    try {
      if (order.store?.id) {
        await this.rankingService.processEvent(
          order.store.id,
          RankingEventType.REVIEW_REPLY,
          review.id,
        );
      }
    } catch (rankErr) {
      this.logger.error(`Error processing ranking review reply event: ${rankErr.message}`);
    }

    return saved;
  }

  /**
   * Retorna reseñas paginadas de las órdenes de un ítem (solo visibles).
   */
  async getOrderReviews(
    itemId: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: OrderReview[]; total: number }> {
    // Obtener todas las ordenes que tienen ese ítem en sus orderItems
    const [items, total] = await this.orderReviewRepository
      .createQueryBuilder('r')
      .innerJoin('order_items', 'oi', 'oi."orderId" = r."orderId"')
      .where('oi."itemId" = :itemId', { itemId })
      .andWhere('r."isVisible" = true')
      .leftJoinAndMapOne('r.author', User, 'author', 'author.id = r."authorId"')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { items, total };
  }

  /**
   * Retorna el historial de BuyerReview que el usuario recibió como comprador.
   */
  async getMyBuyerReviews(
    userId: string,
    page = 1,
    limit = 10,
  ): Promise<{ items: BuyerReview[]; total: number }> {
    const [items, total] = await this.buyerReviewRepository.findAndCount({
      where: { targetUserId: userId, isVisible: true },
      relations: ['author', 'order', 'order.store'],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total };
  }

  /**
   * Obtiene la OrderReview de una orden (si existe).
   */
  async getOrderReviewByOrder(orderId: string): Promise<OrderReview | null> {
    return this.orderReviewRepository.findOne({
      where: { orderId },
      relations: ['author'],
    });
  }

  /**
   * Obtiene la BuyerReview de una orden (si existe).
   */
  async getBuyerReviewByOrder(orderId: string): Promise<BuyerReview | null> {
    return this.buyerReviewRepository.findOne({
      where: { orderId },
      relations: ['author', 'order', 'order.store'],
    });
  }

  // ─── BuyerReview ────────────────────────────────────────────────────────────

  /**
   * El vendedor califica al comprador de una orden completada.
   */
  async createBuyerReview(
    orderId: string,
    vendorUserId: string,
    dto: CreateBuyerReviewDto,
  ): Promise<BuyerReview> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['store', 'store.owner', 'user'],
    });
    if (!order) throw new NotFoundException(`Orden ${orderId} no encontrada`);
    if (order.status !== OrderStatus.FULLY_PAID) {
      throw new ForbiddenException('Solo se pueden calificar compradores de órdenes completadas');
    }
    if (order.store?.owner?.id !== vendorUserId) {
      throw new ForbiddenException('Solo el dueño de la tienda puede calificar al comprador');
    }

    const existing = await this.buyerReviewRepository.findOne({ where: { orderId } });
    if (existing) throw new ConflictException('Ya existe una calificación para el comprador de esta orden');

    if (!order.user) throw new BadRequestException('No se pudo identificar al comprador');

    const review = await this.dataSource.transaction(async (manager) => {
      const newReview = manager.create(BuyerReview, {
        orderId,
        authorId: vendorUserId,
        targetUserId: order.user.id,
        rating: dto.rating,
        comment: dto.comment,
        isVisible: true,
      });
      const saved = await manager.save(BuyerReview, newReview);
      await this.recalcBuyerRating(manager, order.user.id);
      return saved;
    });

    // Notificar al comprador
    await this.notificationService.create({
      userId: order.user.id,
      title: '⭐ Recibiste una calificación',
      body: `Una tienda te calificó como comprador con ${dto.rating} estrellas.`,
      type: NotificationType.BUYER_REVIEW_RECEIVED,
      targetId: orderId,
      orderId,
    });

    return review;
  }

  /**
   * El vendedor edita su BuyerReview dentro de 3 días.
   */
  async updateBuyerReview(
    reviewId: string,
    vendorUserId: string,
    dto: UpdateBuyerReviewDto,
  ): Promise<BuyerReview> {
    const review = await this.buyerReviewRepository.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Calificación no encontrada');
    if (review.authorId !== vendorUserId) throw new ForbiddenException('No autorizado');
    if (Date.now() - review.createdAt.getTime() > THREE_DAYS_MS) {
      throw new ForbiddenException('La ventana de edición de 3 días ha expirado');
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.rating !== undefined) review.rating = dto.rating;
      if (dto.comment !== undefined) review.comment = dto.comment;
      const saved = await manager.save(BuyerReview, review);
      await this.recalcBuyerRating(manager, review.targetUserId);
      return saved;
    });
  }

  // ─── Moderación ─────────────────────────────────────────────────────────────

  async updateOrderReviewVisibility(
    reviewId: string,
    dto: UpdateReviewVisibilityDto,
  ): Promise<OrderReview> {
    const review = await this.orderReviewRepository.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Reseña no encontrada');

    review.isVisible = dto.isVisible;
    const saved = await this.orderReviewRepository.save(review);

    // Recalcular promedio incluyendo solo las visibles
    const order = await this.orderRepository.findOne({
      where: { id: review.orderId },
      relations: ['orderItems', 'orderItems.item'],
    });
    if (order) {
      await this.dataSource.transaction((m) => this.recalcItemRating(m, order));
    }
    return saved;
  }

  async updateBuyerReviewVisibility(
    reviewId: string,
    dto: UpdateReviewVisibilityDto,
  ): Promise<BuyerReview> {
    const review = await this.buyerReviewRepository.findOne({ where: { id: reviewId } });
    if (!review) throw new NotFoundException('Calificación no encontrada');

    review.isVisible = dto.isVisible;
    const saved = await this.buyerReviewRepository.save(review);
    await this.dataSource.transaction((m) => this.recalcBuyerRating(m, review.targetUserId));
    return saved;
  }

  /** Obtener lista de todas las reseñas para el admin */
  async getAllReviews(
    type?: 'ORDER_REVIEW' | 'BUYER_REVIEW',
    isVisible?: boolean,
    page = 1,
    limit = 20,
  ) {
    if (!type || type === 'ORDER_REVIEW') {
      const qb = this.orderReviewRepository.createQueryBuilder('r')
        .leftJoinAndSelect('r.author', 'author')
        .orderBy('r.createdAt', 'DESC')
        .skip((page - 1) * limit)
        .take(limit);
      if (isVisible !== undefined) qb.andWhere('r.isVisible = :isVisible', { isVisible });
      const [items, total] = await qb.getManyAndCount();
      return { type: 'ORDER_REVIEW', items, total };
    }
    const qb = this.buyerReviewRepository.createQueryBuilder('r')
      .leftJoinAndSelect('r.author', 'author')
      .leftJoinAndSelect('r.targetUser', 'targetUser')
      .orderBy('r.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);
    if (isVisible !== undefined) qb.andWhere('r.isVisible = :isVisible', { isVisible });
    const [items, total] = await qb.getManyAndCount();
    return { type: 'BUYER_REVIEW', items, total };
  }

  // ─── Disparador de notificaciones al completar orden (llamado por OrderService) ─

  /**
   * Enviar notificaciones push a cliente y vendedor para que califiquen,
   * invocado desde OrderService al pasar una orden a FULLY_PAID.
   */
  async sendReviewPromptNotifications(order: Order): Promise<void> {
    try {
      if (order.user?.id) {
        await this.notificationService.create({
          userId: order.user.id,
          title: '🌟 ¿Cómo estuvo tu compra?',
          body: 'Tu orden ha sido completada. ¡Deja tu calificación!',
          type: NotificationType.ORDER_REVIEW_PROMPT,
          orderId: order.id,
          targetId: order.id,
        });
      }
      if (order.store?.owner?.id) {
        await this.notificationService.create({
          userId: order.store.owner.id,
          title: '👤 Califica a tu comprador',
          body: 'Una orden fue completada. Puedes calificar al cliente.',
          type: NotificationType.BUYER_REVIEW_PROMPT,
          orderId: order.id,
          targetId: order.id,
        });
      }
    } catch (err) {
      this.logger.error(`Error sending review prompt notifications: ${err.message}`);
    }
  }

  // ─── Helpers privados ────────────────────────────────────────────────────────

  /**
   * Recalcula y persiste averageRating y totalReviews en el Item principal de la orden.
   * Usa el entity manager de la transacción en curso.
   */
  private async recalcItemRating(manager: any, order: Order): Promise<void> {
    // Obtener el item de la primera línea de la orden
    const firstItem = order.orderItems?.[0]?.item;
    if (!firstItem) return;

    const result = await manager
      .getRepository(OrderReview)
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .innerJoin('order_items', 'oi', 'oi."orderId" = r."orderId"')
      .where('oi."itemId" = :itemId', { itemId: firstItem.id })
      .andWhere('r."isVisible" = true')
      .getRawOne();

    const avg = result?.avg ? parseFloat(parseFloat(result.avg).toFixed(1)) : 0;
    const count = result?.count ? parseInt(result.count, 10) : 0;

    await manager.getRepository(Item).update(firstItem.id, {
      averageRating: avg,
      totalReviews: count,
    });
  }

  /**
   * Recalcula y persiste averageBuyerRating y totalBuyerReviews en el User comprador.
   */
  private async recalcBuyerRating(manager: any, targetUserId: string): Promise<void> {
    const result = await manager
      .getRepository(BuyerReview)
      .createQueryBuilder('r')
      .select('AVG(r.rating)', 'avg')
      .addSelect('COUNT(*)', 'count')
      .where('r."targetUserId" = :targetUserId', { targetUserId })
      .andWhere('r."isVisible" = true')
      .getRawOne();

    const avg = result?.avg ? parseFloat(parseFloat(result.avg).toFixed(1)) : 0;
    const count = result?.count ? parseInt(result.count, 10) : 0;

    await manager.getRepository(User).update(targetUserId, {
      averageBuyerRating: avg,
      totalBuyerReviews: count,
    });
  }
}
