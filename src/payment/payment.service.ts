import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { Payment } from './entities/payment.entity';
import { PaymentStatus } from './types';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types';
import { User } from 'src/user/entities/user.entity';
import { Store } from 'src/store/entities/store.entity';
import { PaymentPaginationDto } from './dto/payment-pagination.dto';

@Injectable()
export class PaymentService {

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepository: Repository<Payment>,

    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Store)
    private readonly storeRepository: Repository<Store>,

    private readonly dataSource: DataSource,
  ) {}

  async verifyPayment(paymentId: string, newStatus: PaymentStatus, storeOwnerId: string) {
    if (newStatus !== PaymentStatus.APPROVED && newStatus !== PaymentStatus.REJECTED) {
      throw new BadRequestException('Estado de verificación no válido. Debe ser APPROVED o REJECTED');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payment = await queryRunner.manager.findOne(Payment, {
        where: { id: paymentId },
        relations: ['order', 'store', 'store.owner']
      });

      if (!payment) throw new NotFoundException(`Pago #${paymentId} no encontrado`);
      
      if (payment.status !== PaymentStatus.WAITING_VERIFICATION) {
        throw new BadRequestException('Este pago ya ha sido procesado previamente');
      }

      if (!payment.store.owner || payment.store.owner.id !== storeOwnerId) {
        throw new BadRequestException('No tienes permiso para verificar pagos de esta tienda');
      }

      const store = payment.store;

      if (newStatus === PaymentStatus.APPROVED) {
        // Bloquear la orden primero
        await queryRunner.manager.findOne(Order, {
          where: { id: payment.order.id },
          lock: { mode: 'pessimistic_write' }
        });

        // Cargar con relaciones después
        const order = await queryRunner.manager.findOne(Order, {
          where: { id: payment.order.id },
          relations: ['payments']
        });

        if (!order) throw new NotFoundException(`Orden de la transacción no encontrada`);

        const approvedPayments = order.payments.filter(p => p.status === PaymentStatus.APPROVED);
        
        if (order.isPartialPayment && approvedPayments.length === 0) {
          const minPercentage = parseFloat(store.minInitialPaymentPercentage.toString());
          const minAmount = (order.finalAmount * minPercentage) / 100;
          const currentAmount = parseFloat(payment.amount.toString());

          if (currentAmount < minAmount) {
            throw new BadRequestException(
              `El pago inicial ($${currentAmount}) es menor al mínimo requerido ($${minAmount.toFixed(2)})`
            );
          }
        }

        const currentBalance = parseFloat(order.balance.toString());
        const amount = parseFloat(payment.amount.toString());
        const newBalance = currentBalance - amount;
        order.balance = newBalance < 0.01 ? 0 : newBalance;

        if (order.balance === 0) {
          order.status = OrderStatus.FULLY_PAID;
          order.nextDueDate = null;
        } else {
          order.status = OrderStatus.PARTIALLY_PAID;
          
          const now = new Date();
          if (approvedPayments.length === 0) {
            order.monthlyDueDay = now.getDate();
          }

          const nextDate = new Date();
          nextDate.setMonth(now.getMonth() + 1);
          if (order.monthlyDueDay) {
            nextDate.setDate(order.monthlyDueDay);
          }
          order.nextDueDate = nextDate;
        }

        await queryRunner.manager.save(order);
      }

      payment.status = newStatus;
      const savedPayment = await queryRunner.manager.save(payment);

      await queryRunner.commitTransaction();
      return savedPayment;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async create(createPaymentDto: CreatePaymentDto) {
    const { orderId, amount, userId, storeId } = createPaymentDto;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Bloquear la orden para edición (Evita condiciones de carrera en el balance/pagos)
      // Nota: No cargamos relaciones aquí para evitar error de Postgres con FOR UPDATE y OUTER JOINS
      const order = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' }
      });

      if (!order) throw new NotFoundException(`Orden #${orderId} no encontrada`);

      // 2. Cargar relaciones necesarias por separado o recargar la entidad
      // Al estar en una transacción con bloqueo, los datos serán consistentes
      const orderWithRelations = await queryRunner.manager.findOne(Order, {
        where: { id: orderId },
        relations: ['payments', 'user']
      });

      if (!orderWithRelations) throw new NotFoundException(`Orden #${orderId} no encontrada`);

      if (orderWithRelations.user.id !== userId) {
        throw new BadRequestException('No tienes permiso para realizar pagos a esta orden');
      }

      const user = await queryRunner.manager.findOne(User, { where: { id: userId } });
      if (!user) throw new NotFoundException(`Usuario #${userId} no encontrado`);

      const store = await queryRunner.manager.findOne(Store, { where: { id: storeId } });
      if (!store) throw new NotFoundException(`Tienda #${storeId} no encontrada`);

      if (orderWithRelations.isPartialPayment) {
        const approvedPaymentsCount = orderWithRelations.payments.filter(p => p.status === PaymentStatus.APPROVED).length;
        const maxAllowed = parseInt(store.maxInstallments?.toString() || '0');

        if (maxAllowed > 0 && approvedPaymentsCount >= maxAllowed) {
          throw new BadRequestException(`Se ha alcanzado el límite de ${maxAllowed} cuotas para esta orden`);
        }
      }

      const currentBalance = parseFloat(orderWithRelations.balance.toString());
      const incomingAmount = parseFloat(amount.toString());
      if (incomingAmount > currentBalance + 0.01) {
        throw new BadRequestException(`El monto excede el balance pendiente ($${currentBalance})`);
      }

      const { reference } = createPaymentDto;
      if (reference) {
        const existingPayment = await queryRunner.manager.findOne(Payment, {
          where: { 
            reference,
            store: { id: storeId }
          }
        });
        if (existingPayment) {
          throw new BadRequestException(`La referencia bancaria "${reference}" ya ha sido utilizada en esta tienda.`);
        }
      }

      const payment = queryRunner.manager.create(Payment, {
        ...createPaymentDto,
        order,
        user,
        store,
        status: PaymentStatus.WAITING_VERIFICATION,
      });

      const savedPayment = await queryRunner.manager.save(payment);

      await queryRunner.commitTransaction();
      return savedPayment;

    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(paginationDto: PaymentPaginationDto) {
    const { status, paymentMethod, currency, reference, storeId, userId, limit, offset, sort, order } = paginationDto;

    const queryBuilder = this.paymentRepository.createQueryBuilder('payment')
      .leftJoinAndSelect('payment.order', 'order')
      .leftJoinAndSelect('payment.user', 'user')
      .leftJoinAndSelect('payment.store', 'store');

    if (status) {
      queryBuilder.andWhere('payment.status = :status', { status });
    }

    if (paymentMethod) {
      queryBuilder.andWhere('payment.paymentMethod = :paymentMethod', { paymentMethod });
    }

    if (currency) {
      queryBuilder.andWhere('payment.currency = :currency', { currency });
    }

    if (reference) {
      queryBuilder.andWhere('payment.reference LIKE :reference', { reference: `%${reference}%` });
    }

    if (storeId) {
      queryBuilder.andWhere('store.id = :storeId', { storeId });
    }

    if (userId) {
      queryBuilder.andWhere('user.id = :userId', { userId });
    }

    // Ordenamiento
    const validSortFields = ['createdAt', 'amount', 'status'];
    const sortField = validSortFields.includes(sort as string) ? `payment.${sort}` : 'payment.createdAt';
    queryBuilder.orderBy(sortField, order || 'DESC');

    queryBuilder.skip(offset).take(limit);

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      total,
      limit,
      offset
    };
  }

  async findOne(id: string) {
    const payment = await this.paymentRepository.findOne({
      where: { id },
      relations: ['order', 'user', 'store']
    });
    if (!payment) throw new NotFoundException(`Pago #${id} no encontrado`);
    return payment;
  }

  async update(id: string, updatePaymentDto: UpdatePaymentDto) {
    const payment = await this.findOne(id);
    this.paymentRepository.merge(payment, updatePaymentDto);
    return await this.paymentRepository.save(payment);
  }

  async remove(id: string) {
    const payment = await this.findOne(id);
    await this.paymentRepository.remove(payment);
    return { deleted: true };
  }
}
