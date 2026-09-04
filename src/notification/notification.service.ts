import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { NotificationGateway } from './notification.gateway';
import { Order } from 'src/order/entities/order.entity';
import { OrderStatus } from 'src/order/types/order-status.enum';
import { User } from 'src/user/entities/user.entity';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    @InjectRepository(ChatMessage)
    private readonly chatMessageRepository: Repository<ChatMessage>,
    @InjectRepository(Order)
    private readonly orderRepository: Repository<Order>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  /**
   * Sanitiza un ChatMessage de TypeORM en un DTO limpio para emitir por WebSocket.
   * Evita enviar el objeto Order completo con todas sus relaciones anidadas.
   */
  private toChatMessageDto(message: ChatMessage, orderId: string) {
    return {
      id: message.id,
      orderId,
      sender: message.sender
        ? {
            id: message.sender.id,
            firstName: message.sender.firstName,
            lastName: message.sender.lastName,
          }
        : null,
      content: message.content,
      imageUrl: message.imageUrl,
      createdAt: message.createdAt,
      isRead: message.isRead,
      isDelivered: message.isDelivered,
    };
  }

  async checkChatStatusForOrder(orderId: string): Promise<{
    allowed: boolean;
    reason?: 'NOT_FOUND' | 'CHAT_CLOSED' | 'CHAT_DISABLED';
  }> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['store'],
    });
    if (!order) {
      return { allowed: false, reason: 'NOT_FOUND' };
    }
    if (order.store && order.store.allowChat === false) {
      return { allowed: false, reason: 'CHAT_DISABLED' };
    }
    if (order.status === OrderStatus.FULLY_PAID || order.status === OrderStatus.CANCELLED) {
      return { allowed: false, reason: 'CHAT_CLOSED' };
    }
    return { allowed: true };
  }

  async isOrderActiveForChat(orderId: string): Promise<boolean> {
    const status = await this.checkChatStatusForOrder(orderId);
    return status.allowed;
  }

  closeChatRoom(orderId: string, reason: string): void {
    // Forzar la expulsión de clientes emitiendo el evento
    this.notificationGateway.sendToOrderRoom(orderId, 'chat_closed', {
      orderId,
      reason,
    });
    // Opcional: También podríamos hacer que la pasarela expulse a los sockets (client.leave)
    // pero si el cliente hace context.pop() y luego el screen hace leave_chat al desmontarse,
    // se manejará de forma limpia desde el cliente.
  }

  notifyStoreInstallmentsUpdated(storeId: string, data?: any) {
    if (!storeId) return;
    this.notificationGateway.sendToStore(storeId, 'store_installments_updated', {
      storeId,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  async create(data: {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    targetId?: string;
    orderId?: string;
    storeId?: string;
  }) {
    try {
      let notification: Notification;
      const targetId = data.targetId || data.orderId;

      // Si tiene targetId, intentamos buscar una existente para actualizarla (evitar duplicados de chat o pedidos)
      if (targetId) {
        const existing = await this.notificationRepository.findOne({
          where: {
            userId: data.userId,
            type: data.type,
            targetId,
          },
        });

        if (existing) {
          notification = existing;
          notification.title = data.title;
          notification.body = data.body;
          notification.isRead = false; // Marcar como no leída al actualizar
          notification.createdAt = new Date(); // Actualizar fecha para que suba en la lista
        } else {
          notification = this.notificationRepository.create({
            userId: data.userId,
            title: data.title,
            body: data.body,
            type: data.type,
            targetId,
          });
        }
      } else {
        notification = this.notificationRepository.create(data);
      }

      const savedNotification =
        await this.notificationRepository.save(notification);

      // Emit via WebSocket to user
      this.notificationGateway.sendToUser(
        data.userId,
        'new_notification',
        savedNotification,
      );

      // Si se proporcionó un storeId, emitir también a la sala de la tienda y notificar actualización de cuotas
      if (data.storeId) {
        this.notificationGateway.sendToStore(
          data.storeId,
          'new_notification',
          savedNotification,
        );
        this.notifyStoreInstallmentsUpdated(data.storeId, {
          orderId: targetId,
          type: data.type,
        });
      }

      return savedNotification;
    } catch (error) {
      this.logger.error(`Failed to create notification: ${error.message}`);
      // We don't throw here to avoid breaking the caller's transaction if notifications fail
    }
  }

  async findAllByUser(userId: string) {
    return this.notificationRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markAsRead(id: string) {
    await this.notificationRepository.update(id, { isRead: true });
  }

  async saveMessage(
    orderId: string,
    senderId: string,
    content: string,
    imageUrl?: string,
  ) {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: [
        'store',
        'store.owner',
        'store.company',
        'store.company.owner',
        'user',
      ],
    });
    if (!order) return null;

    const sender = await this.chatMessageRepository.manager.findOne(User, {
      where: { id: senderId },
    });

    const message = this.chatMessageRepository.create({
      order,
      sender: sender || ({ id: senderId } as User),
      content: content || (imageUrl ? '📷 Imagen adjunta' : ''),
      imageUrl,
    });

    const savedMessage = await this.chatMessageRepository.save(message);

    // Emitir a la sala de la orden (DTO sanitizado, sin el objeto Order anidado)
    const messageDto = this.toChatMessageDto(savedMessage, orderId);
    this.notificationGateway.sendToOrderRoom(
      orderId,
      'new_chat_message',
      messageDto,
    );

    // También notificar al destinatario si no está en la sala (notificación push simulada)
    const recipientId =
      senderId === order.user.id
        ? order.store.owner?.id || order.store.company?.owner?.id
        : order.user.id;

    if (recipientId) {
      const isToBusiness = senderId === order.user.id;
      const senderName = isToBusiness
        ? `${order.user.firstName} ${order.user.lastName}`
        : order.store.name;

      const title = isToBusiness
        ? `Un cliente envió un mensaje a ${order.store.name}`
        : `Nuevo mensaje de ${order.store.name}`;

      const shortOrderId = orderId.substring(0, 8).toUpperCase();
      const body = isToBusiness
        ? `Orden #${shortOrderId}: ${content.length > 80 ? content.substring(0, 77) + '...' : content}`
        : content.length > 100
          ? content.substring(0, 97) + '...'
          : content;

      await this.create({
        userId: recipientId,
        title,
        body,
        type: NotificationType.CHAT_MESSAGE,
        targetId: orderId,
      });

      this.notificationGateway.sendToUser(recipientId, 'chat_notification', {
        orderId,
        senderName: isToBusiness ? senderName : order.store.name,
        content: content.substring(0, 50) + (content.length > 50 ? '...' : ''),
      });
    }

    return savedMessage;
  }

  async markMessagesRead(orderId: string, readerId: string) {
    // Marcar como leídos los mensajes de la orden donde el remitente NO sea quien está leyendo
    const updateResult = await this.chatMessageRepository.update(
      {
        order: { id: orderId },
        isRead: false,
        sender: { id: Not(readerId) },
      },
      { isRead: true, isDelivered: true },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      // Notificar a la sala que los mensajes han sido leídos
      this.notificationGateway.sendToOrderRoom(orderId, 'messages_read', {
        orderId,
        readBy: readerId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  async markMessagesDelivered(orderId: string, recipientId: string) {
    const updateResult = await this.chatMessageRepository.update(
      {
        order: { id: orderId },
        isDelivered: false,
        sender: { id: Not(recipientId) },
      },
      { isDelivered: true },
    );

    if (updateResult.affected && updateResult.affected > 0) {
      this.notificationGateway.sendToOrderRoom(orderId, 'messages_delivered', {
        orderId,
        deliveredTo: recipientId,
      });
    }
  }

  async getChatHistory(orderId: string) {
    const messages = await this.chatMessageRepository.find({
      where: { order: { id: orderId } },
      relations: ['sender'],
      order: { createdAt: 'ASC' },
      take: 100,
    });
    return messages.map((m) => this.toChatMessageDto(m, orderId));
  }
}
