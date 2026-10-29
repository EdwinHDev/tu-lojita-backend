import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository, MoreThan } from 'typeorm';
import { Item } from './entities/item.entity';
import { ItemSlotConfig } from './entities/item-slot-config.entity';
import { ItemTimeSlot } from './entities/item-time-slot.entity';
import { ItemPreorderConfig } from './entities/item-preorder-config.entity';
import { OrderSlotBooking } from '../order/entities/order-slot-booking.entity';
import { Order } from '../order/entities/order.entity';
import { User } from '../user/entities/user.entity';
import { BookingType } from './types/booking-type.enum';
import { DepositType } from './types/deposit-type.enum';
import { ServiceLocationType } from './types/service-location-type.enum';
import { SlotBookingStatus } from '../order/types/slot-booking-status.enum';
import { PreOrderStatus } from '../order/types/preorder-status.enum';
import {
  CreateSlotConfigDto,
  CreatePreorderConfigDto,
} from './dto/booking-config.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from '../notification/entities/notification.entity';

export interface SlotAvailabilityResult {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  status: 'AVAILABLE' | 'HELD' | 'BOOKED' | 'EXPIRED';
  remainingCapacity: number;
  maxCapacity: number;
  reason?: string;
}

@Injectable()
export class BookingService {
  private readonly logger = new Logger(BookingService.name);

  constructor(
    @InjectRepository(Item)
    private readonly itemRepository: Repository<Item>,
    @InjectRepository(ItemSlotConfig)
    private readonly slotConfigRepository: Repository<ItemSlotConfig>,
    @InjectRepository(ItemTimeSlot)
    private readonly timeSlotRepository: Repository<ItemTimeSlot>,
    @InjectRepository(ItemPreorderConfig)
    private readonly preorderConfigRepository: Repository<ItemPreorderConfig>,
    @InjectRepository(OrderSlotBooking)
    private readonly slotBookingRepository: Repository<OrderSlotBooking>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly dataSource: DataSource,
    private readonly notificationService: NotificationService,
  ) {}

  /**
   * Configura o actualiza los horarios y turnos de un servicio.
   */
  async configureSlotBooking(
    itemId: string,
    dto: CreateSlotConfigDto,
    user: User,
  ): Promise<ItemSlotConfig> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['store', 'store.owner', 'slotConfig', 'slotConfig.slots'],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${itemId} no encontrado`);
    }

    if (item.store?.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para configurar este artículo',
      );
    }

    if (dto.minNoticeHours !== undefined && dto.minNoticeHours < 0) {
      throw new BadRequestException(
        'El tiempo mínimo de anticipación no puede ser negativo',
      );
    }

    // Validar horarios si se enviaron
    if (dto.slots && Array.isArray(dto.slots)) {
      for (const s of dto.slots) {
        if (!s.startTime || !s.endTime || !s.label) {
          throw new BadRequestException(
            'Cada turno debe incluir hora de inicio, hora de fin y etiqueta',
          );
        }
        if (s.startTime >= s.endTime) {
          throw new BadRequestException(
            `La hora de inicio (${s.startTime}) debe ser anterior a la hora de fin (${s.endTime})`,
          );
        }
      }
    }

    let slotConfig = item.slotConfig;
    if (!slotConfig) {
      slotConfig = this.slotConfigRepository.create({
        itemId: item.id,
        item,
        minNoticeHours:
          dto.minNoticeHours !== undefined ? dto.minNoticeHours : 2,
        serviceDurationMinutes: dto.serviceDurationMinutes || 60,
        allowSameDay: dto.allowSameDay !== undefined ? dto.allowSameDay : true,
        maxConcurrentBookings: dto.maxConcurrentBookings || 1,
        serviceLocationType:
          dto.serviceLocationType || ServiceLocationType.ON_SITE,
      });
      slotConfig = await this.slotConfigRepository.save(slotConfig);
    } else {
      if (dto.minNoticeHours !== undefined)
        slotConfig.minNoticeHours = dto.minNoticeHours;
      if (dto.serviceDurationMinutes !== undefined)
        slotConfig.serviceDurationMinutes = dto.serviceDurationMinutes;
      if (dto.allowSameDay !== undefined)
        slotConfig.allowSameDay = dto.allowSameDay;
      if (dto.maxConcurrentBookings !== undefined)
        slotConfig.maxConcurrentBookings = dto.maxConcurrentBookings;
      if (dto.serviceLocationType !== undefined)
        slotConfig.serviceLocationType = dto.serviceLocationType;
      slotConfig = await this.slotConfigRepository.save(slotConfig);
    }

    // Reemplazar slots si vienen en el payload
    if (dto.slots && Array.isArray(dto.slots)) {
      await this.timeSlotRepository.delete({ slotConfigId: slotConfig.id });
      const newSlots = dto.slots.map((s) =>
        this.timeSlotRepository.create({
          slotConfig,
          slotConfigId: slotConfig.id,
          dayOfWeek: s.dayOfWeek || null,
          specificDate: s.specificDate || null,
          startTime: s.startTime,
          endTime: s.endTime,
          label: s.label,
          isActive: s.isActive !== undefined ? s.isActive : true,
        }),
      );
      await this.timeSlotRepository.save(newSlots);
      slotConfig.slots = newSlots;
    }

    // Actualizar item
    item.bookingType = BookingType.TIME_SLOT;
    item.requiresBooking = true;
    await this.itemRepository.save(item);

    return slotConfig;
  }

  /**
   * Configura o actualiza la modalidad de preventa / bajo demanda para un producto físico.
   */
  async configurePreorder(
    itemId: string,
    dto: CreatePreorderConfigDto,
    user: User,
  ): Promise<ItemPreorderConfig> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['store', 'store.owner', 'preorderConfig'],
    });

    if (!item) {
      throw new NotFoundException(`Item con ID ${itemId} no encontrado`);
    }

    if (item.store?.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para configurar este artículo',
      );
    }

    if (
      dto.estimatedLeadDaysMin !== undefined &&
      dto.estimatedLeadDaysMax !== undefined &&
      dto.estimatedLeadDaysMin > dto.estimatedLeadDaysMax
    ) {
      throw new BadRequestException(
        'El tiempo de entrega mínimo no puede ser mayor que el máximo',
      );
    }

    if (dto.depositType === DepositType.PERCENTAGE) {
      if (
        dto.depositValue === undefined ||
        dto.depositValue <= 0 ||
        dto.depositValue > 100
      ) {
        throw new BadRequestException(
          'El porcentaje de anticipo debe ser mayor a 0 y menor o igual a 100',
        );
      }
    } else if (dto.depositType === DepositType.FIXED_AMOUNT) {
      if (dto.depositValue === undefined || dto.depositValue <= 0) {
        throw new BadRequestException(
          'El monto de anticipo fijo debe ser mayor a 0',
        );
      }
    }

    let preorderConfig = item.preorderConfig;
    if (!preorderConfig) {
      preorderConfig = this.preorderConfigRepository.create({
        itemId: item.id,
        item,
        depositType: dto.depositType || DepositType.FULL_PAYMENT,
        depositValue: dto.depositValue || 0,
        estimatedLeadDaysMin: dto.estimatedLeadDaysMin || 7,
        estimatedLeadDaysMax: dto.estimatedLeadDaysMax || 15,
        maxPreOrderUnits: dto.maxPreOrderUnits || 50,
        settlementWindowHours: dto.settlementWindowHours || 48,
      });
    } else {
      if (dto.depositType !== undefined)
        preorderConfig.depositType = dto.depositType;
      if (dto.depositValue !== undefined)
        preorderConfig.depositValue = dto.depositValue;
      if (dto.estimatedLeadDaysMin !== undefined)
        preorderConfig.estimatedLeadDaysMin = dto.estimatedLeadDaysMin;
      if (dto.estimatedLeadDaysMax !== undefined)
        preorderConfig.estimatedLeadDaysMax = dto.estimatedLeadDaysMax;
      if (dto.maxPreOrderUnits !== undefined)
        preorderConfig.maxPreOrderUnits = dto.maxPreOrderUnits;
      if (dto.settlementWindowHours !== undefined)
        preorderConfig.settlementWindowHours = dto.settlementWindowHours;
    }

    const savedConfig =
      await this.preorderConfigRepository.save(preorderConfig);

    item.bookingType = BookingType.PRE_ORDER;
    item.requiresBooking = true;
    await this.itemRepository.save(item);

    return savedConfig;
  }

  /**
   * Consulta los turnos disponibles para una fecha específica con evaluación de caducidad en tiempo real.
   */
  async getAvailableSlots(
    itemId: string,
    bookingDate: string, // YYYY-MM-DD
  ): Promise<SlotAvailabilityResult[]> {
    const item = await this.itemRepository.findOne({
      where: { id: itemId },
      relations: ['store', 'slotConfig', 'slotConfig.slots'],
    });

    if (!item || !item.slotConfig) {
      return [];
    }

    const config = item.slotConfig;
    const slots = (config.slots || []).filter((s) => s.isActive);
    if (slots.length === 0) return [];

    // Calcular día de la semana para la fecha solicitada (1 = Lunes ... 7 = Domingo)
    const [year, month, day] = bookingDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    const jsDay = dateObj.getUTCDay(); // 0 = Domingo, 1 = Lunes, etc.
    const dayOfWeek = jsDay === 0 ? 7 : jsDay;

    // Filtrar slots aplicables para este día
    const applicableSlots = slots.filter((s) => {
      if (s.specificDate) {
        return s.specificDate === bookingDate;
      }
      return (
        s.dayOfWeek === null ||
        s.dayOfWeek === undefined ||
        s.dayOfWeek === dayOfWeek
      );
    });

    // Zona horaria de la tienda (por defecto America/Caracas)
    const storeTimezone =
      (item.store as unknown as { timezone?: string })?.timezone ||
      'America/Caracas';
    const nowInStore = new Date(
      new Date().toLocaleString('en-US', { timeZone: storeTimezone }),
    );

    const storeTodayStr = `${nowInStore.getFullYear()}-${String(nowInStore.getMonth() + 1).padStart(2, '0')}-${String(nowInStore.getDate()).padStart(2, '0')}`;
    const isToday = bookingDate === storeTodayStr;
    const isPast = bookingDate < storeTodayStr;

    const currentMinutes = nowInStore.getHours() * 60 + nowInStore.getMinutes();

    const results: SlotAvailabilityResult[] = [];

    for (const slot of applicableSlots) {
      // 1. Verificar si ya pasó la fecha
      if (isPast) {
        results.push({
          id: slot.id,
          label: slot.label,
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: 'EXPIRED',
          remainingCapacity: 0,
          maxCapacity: config.maxConcurrentBookings,
          reason: 'La fecha ya ha pasado.',
        });
        continue;
      }

      // 2. Evaluar caducidad en tiempo real si es hoy
      if (isToday) {
        if (!config.allowSameDay) {
          results.push({
            id: slot.id,
            label: slot.label,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: 'EXPIRED',
            remainingCapacity: 0,
            maxCapacity: config.maxConcurrentBookings,
            reason: 'Este servicio no admite reservas el mismo día.',
          });
          continue;
        }

        const [endH, endM] = slot.endTime.split(':').map(Number);
        const slotEndMinutes = endH * 60 + endM;
        const deadlineMinutes = slotEndMinutes - config.minNoticeHours * 60;

        if (currentMinutes > deadlineMinutes) {
          results.push({
            id: slot.id,
            label: slot.label,
            startTime: slot.startTime,
            endTime: slot.endTime,
            status: 'EXPIRED',
            remainingCapacity: 0,
            maxCapacity: config.maxConcurrentBookings,
            reason: `Caducó para hoy (requiere ${config.minNoticeHours}h de anticipación antes de terminar a las ${slot.endTime}).`,
          });
          continue;
        }
      }

      // 3. Contar reservas confirmadas y holds vigentes
      const confirmedCount = await this.slotBookingRepository.count({
        where: {
          timeSlotId: slot.id,
          bookingDate,
          status: SlotBookingStatus.CONFIRMED,
        },
      });

      const activeHoldsCount = await this.slotBookingRepository.count({
        where: {
          timeSlotId: slot.id,
          bookingDate,
          status: SlotBookingStatus.HOLD,
          lockedUntil: MoreThan(new Date()),
        },
      });

      const totalOccupied = confirmedCount + activeHoldsCount;
      const remainingCapacity = Math.max(
        0,
        config.maxConcurrentBookings - totalOccupied,
      );

      let status: 'AVAILABLE' | 'HELD' | 'BOOKED' = 'AVAILABLE';
      if (remainingCapacity === 0) {
        status =
          activeHoldsCount > 0 && confirmedCount < config.maxConcurrentBookings
            ? 'HELD'
            : 'BOOKED';
      }

      results.push({
        id: slot.id,
        label: slot.label,
        startTime: slot.startTime,
        endTime: slot.endTime,
        status,
        remainingCapacity,
        maxCapacity: config.maxConcurrentBookings,
      });
    }

    return results;
  }

  /**
   * Bloqueo atómico temporal (Soft Hold con TTL de 15 min) durante checkout para prevenir doble agendamiento.
   */
  async acquireSlotHold(
    itemId: string,
    timeSlotId: string,
    bookingDate: string,
    user: User,
  ): Promise<OrderSlotBooking> {
    return await this.dataSource.transaction(async (manager) => {
      const item = await manager.findOne(Item, {
        where: { id: itemId },
        relations: ['store', 'slotConfig'],
      });

      if (!item || !item.slotConfig) {
        throw new NotFoundException(
          'Configuración de turnos no encontrada para este servicio',
        );
      }

      const slot = await manager.findOne(ItemTimeSlot, {
        where: { id: timeSlotId, slotConfigId: item.slotConfig.id },
      });

      if (!slot || !slot.isActive) {
        throw new NotFoundException('Turno no encontrado o no activo');
      }

      // Validar caducidad en tiempo real
      const storeTimezone =
        (item.store as unknown as { timezone?: string })?.timezone ||
        'America/Caracas';
      const nowInStore = new Date(
        new Date().toLocaleString('en-US', { timeZone: storeTimezone }),
      );
      const storeTodayStr = `${nowInStore.getFullYear()}-${String(nowInStore.getMonth() + 1).padStart(2, '0')}-${String(nowInStore.getDate()).padStart(2, '0')}`;
      if (bookingDate === storeTodayStr) {
        const currentMinutes =
          nowInStore.getHours() * 60 + nowInStore.getMinutes();
        const [endH, endM] = slot.endTime.split(':').map(Number);
        const slotEndMinutes = endH * 60 + endM;
        const deadlineMinutes =
          slotEndMinutes - item.slotConfig.minNoticeHours * 60;
        if (currentMinutes > deadlineMinutes) {
          throw new BadRequestException(
            'El horario seleccionado ya ha caducado para el día de hoy',
          );
        }
      }

      // Contar ocupación actual
      const confirmedCount = await manager.count(OrderSlotBooking, {
        where: {
          timeSlotId: slot.id,
          bookingDate,
          status: SlotBookingStatus.CONFIRMED,
        },
      });

      const activeHoldsCount = await manager.count(OrderSlotBooking, {
        where: {
          timeSlotId: slot.id,
          bookingDate,
          status: SlotBookingStatus.HOLD,
          lockedUntil: MoreThan(new Date()),
        },
      });

      if (
        confirmedCount + activeHoldsCount >=
        item.slotConfig.maxConcurrentBookings
      ) {
        throw new ConflictException(
          'El horario seleccionado ya no tiene cupos disponibles.',
        );
      }

      // Crear hold con TTL de 15 minutos
      const holdTtlMinutes = 15;
      const lockedUntil = new Date(Date.now() + holdTtlMinutes * 60 * 1000);

      const bookingHold = manager.create(OrderSlotBooking, {
        bookingDate,
        slotStartTime: slot.startTime,
        slotEndTime: slot.endTime,
        slotLabel: slot.label,
        lockedUntil,
        status: SlotBookingStatus.HOLD,
        timeSlot: slot,
        timeSlotId: slot.id,
        customer: user,
        customerId: user.id,
        store: item.store,
        storeId: item.store.id,
      });

      return await manager.save(OrderSlotBooking, bookingHold);
    });
  }

  /**
   * Libera holds expirados cuyo TTL venció sin pago confirmado.
   */
  async releaseExpiredHolds(): Promise<number> {
    const result = await this.slotBookingRepository
      .createQueryBuilder()
      .update(OrderSlotBooking)
      .set({ status: SlotBookingStatus.EXPIRED })
      .where('status = :status AND "lockedUntil" < :now', {
        status: SlotBookingStatus.HOLD,
        now: new Date(),
      })
      .execute();

    const released = result.affected || 0;
    if (released > 0) {
      this.logger.log(`Liberados ${released} turnos con hold expirado.`);
    }
    return released;
  }

  /**
   * Reserva atómicamente cupos de preventa para un artículo bajo demanda.
   */
  async reservePreOrderQuota(
    itemId: string,
    quantity: number,
    manager: EntityManager,
  ): Promise<ItemPreorderConfig> {
    const config = await manager.findOne(ItemPreorderConfig, {
      where: { itemId },
      lock: { mode: 'pessimistic_write' },
    });

    if (!config) {
      throw new NotFoundException('Configuración de preventa no encontrada');
    }

    if (config.reservedPreOrderUnits + quantity > config.maxPreOrderUnits) {
      throw new BadRequestException(
        `Cupo máximo de preventa alcanzado para este artículo (disponibles: ${Math.max(0, config.maxPreOrderUnits - config.reservedPreOrderUnits)})`,
      );
    }

    config.reservedPreOrderUnits += quantity;
    return await manager.save(ItemPreorderConfig, config);
  }

  /**
   * Acción del comercio cuando la mercancía de un pedido bajo demanda llega a tienda.
   */
  async markPreOrderStockArrived(orderId: string, user: User): Promise<Order> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'store',
        'store.owner',
        'user',
        'orderItems',
        'orderItems.item',
        'orderItems.item.preorderConfig',
      ],
    });

    if (!order) {
      throw new NotFoundException(`Orden con ID ${orderId} no encontrada`);
    }

    if (order.store?.owner?.id !== user.id) {
      throw new ForbiddenException(
        'No tienes permiso para actualizar esta orden',
      );
    }

    const preorderItem = order.orderItems?.find(
      (oi) => oi.item?.preorderConfig,
    );
    const settlementHours =
      preorderItem?.item?.preorderConfig?.settlementWindowHours || 48;

    order.preOrderStatus = PreOrderStatus.READY_FOR_SETTLEMENT;
    order.settlementDeadline = new Date(
      Date.now() + settlementHours * 3600 * 1000,
    );

    const savedOrder = await this.orderRepository.save(order);

    // Notificar al comprador
    try {
      if (order.user?.id) {
        await this.notificationService.create({
          userId: order.user.id,
          storeId: order.store.id,
          orderId: order.id,
          type: NotificationType.GENERAL,
          title: '¡Tu pedido bajo demanda ya llegó!',
          body: `Tu artículo en la tienda "${order.store.name}" ya está listo para retiro o liquidación. Tienes ${settlementHours} horas para completar tu orden.`,
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Error enviando notificación de llegada de stock: ${message}`,
      );
    }

    return savedOrder;
  }
}
