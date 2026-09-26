import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  SubscribeMessage,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger, forwardRef, Inject } from '@nestjs/common';
import { envs } from '../config/envs';
import { NotificationService } from './notification.service';
import { filterChatContent } from '../common/utils/content-filter.utils';
import { UserRole } from '../user/types';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
  namespace: 'notifications',
})
@Injectable()
export class NotificationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
  ) {}

  // ─── Connection lifecycle ───────────────────────────────────────────────────

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(
          `Client ${client.id} connected without token, disconnecting...`,
        );
        client.emit('auth_error', { reason: 'MISSING_TOKEN' });
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync(token, {
        secret: envs.jwtSecret,
      });
      const userId = payload.sub;
      client.join(`user_${userId}`);
      this.logger.log(
        `Client ${client.id} (User: ${userId}) connected → room user_${userId}`,
      );

      // Si el usuario tiene rol ADMIN, unirlo automáticamente a admin_room y enviarle badges iniciales
      const user = await this.notificationService.findUserById(userId);
      if (user && user.role === UserRole.ADMIN) {
        client.join('admin_room');
        this.logger.log(`Admin client ${client.id} joined admin_room`);
        const summary = await this.notificationService.getAdminBadgesSummary();
        client.emit('admin_badges_updated', summary);
      }
    } catch (error) {
      this.logger.error(
        `Auth failed for client ${client.id}: ${error.message}`,
      );
      client.emit('auth_error', {
        reason: 'JWT_EXPIRED',
        message: error.message,
      });
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  // ─── Chat events ────────────────────────────────────────────────────────────

  @SubscribeMessage('join_chat')
  async handleJoinChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    const room = `order_chat_${data.orderId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);

    // 1. Enviar historial al cliente que se une
    const history = await this.notificationService.getChatHistory(data.orderId);
    client.emit('chat_history', history);

    // 2. Marcar los mensajes entrantes como entregados y obtener userId
    let userId: string | undefined;
    try {
      const token = this.extractToken(client);
      if (token) {
        const payload = await this.jwtService.verifyAsync(token, {
          secret: envs.jwtSecret,
        });
        userId = payload.sub;
        await this.notificationService.markMessagesDelivered(
          data.orderId,
          payload.sub,
        );
      }
    } catch (e) {
      this.logger.error(`Error marking delivered on join: ${e.message}`);
    }

    // 3. Notificar al cliente si el chat no está permitido, la orden está cerrada o hay suspensión activa
    const chatStatus = await this.notificationService.checkChatStatusForOrder(
      data.orderId,
      userId,
    );
    if (!chatStatus.allowed) {
      if (chatStatus.reason === 'CHAT_DISABLED') {
        client.emit('chat_closed', {
          orderId: data.orderId,
          reason: 'chat_disabled',
        });
        client.leave(room);
      } else if (chatStatus.reason === 'CHAT_CLOSED') {
        client.emit('chat_closed', {
          orderId: data.orderId,
          reason: 'resolved',
        });
      } else if (
        chatStatus.reason === 'USER_CHAT_SUSPENDED' ||
        chatStatus.reason === 'COUNTERPART_CHAT_SUSPENDED'
      ) {
        client.emit('chat_closed', {
          orderId: data.orderId,
          reason: chatStatus.reason,
          isPermanent: chatStatus.isPermanent,
          until: chatStatus.until,
          reasonText: chatStatus.reasonText,
          evidence: chatStatus.evidence,
        });
      }
    }
  }

  @SubscribeMessage('leave_chat')
  async handleLeaveChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    const room = `order_chat_${data.orderId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} left ${room}`);
  }

  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    data: { orderId: string; content?: string; imageUrl?: string },
  ) {
    const token = this.extractToken(client);
    if (!token) {
      client.emit('auth_error', { reason: 'MISSING_TOKEN' });
      client.disconnect();
      return { success: false, error: 'INVALID_TOKEN' };
    }

    let userId: string;
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: envs.jwtSecret,
      });
      userId = payload.sub;
    } catch (e) {
      this.logger.error(`Error verifying token in send_message: ${e.message}`);
      client.emit('auth_error', { reason: 'JWT_EXPIRED', message: e.message });
      client.disconnect();
      return { success: false, error: 'INVALID_TOKEN' };
    }

    const chatStatus = await this.notificationService.checkChatStatusForOrder(
      data.orderId,
      userId,
    );
    if (!chatStatus.allowed) {
      if (chatStatus.reason === 'CHAT_DISABLED') {
        client.emit('chat_closed', {
          orderId: data.orderId,
          reason: 'chat_disabled',
        });
        return { success: false, error: 'CHAT_DISABLED' };
      }
      if (
        chatStatus.reason === 'USER_CHAT_SUSPENDED' ||
        chatStatus.reason === 'COUNTERPART_CHAT_SUSPENDED'
      ) {
        client.emit('chat_closed', {
          orderId: data.orderId,
          reason: chatStatus.reason,
          isPermanent: chatStatus.isPermanent,
          until: chatStatus.until,
          reasonText: chatStatus.reasonText,
          evidence: chatStatus.evidence,
        });
        return { success: false, error: chatStatus.reason };
      }
      client.emit('chat_closed', { orderId: data.orderId, reason: 'resolved' });
      return { success: false, error: 'CHAT_CLOSED' };
    }

    // Moderación automatizada de lenguaje abusivo y estafas
    if (data.content) {
      const moderation = filterChatContent(data.content);
      if (!moderation.isValid) {
        client.emit('chat_policy_violation', {
          orderId: data.orderId,
          reason: moderation.reason,
          matchedCategory: moderation.matchedCategory,
        });
        return {
          success: false,
          error: 'POLICY_VIOLATION',
          message: moderation.reason,
        };
      }
    }

    try {
      const savedMessage = await this.notificationService.saveMessage(
        data.orderId,
        userId,
        data.content || '',
        data.imageUrl,
      );
      if (!savedMessage) {
        return { success: false, error: 'ORDER_NOT_FOUND' };
      }
      return {
        success: true,
        messageId: savedMessage.id,
        imageUrl: savedMessage.imageUrl,
        createdAt: savedMessage.createdAt
          ? savedMessage.createdAt.toISOString()
          : new Date().toISOString(),
      };
    } catch (e) {
      this.logger.error(`Error in send_message: ${e.message}`);
      return { success: false, error: 'INTERNAL_ERROR' };
    }
  }

  @SubscribeMessage('typing')
  async handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string; isTyping: boolean },
  ) {
    try {
      const token = this.extractToken(client);
      if (!token) return;
      const payload = await this.jwtService.verifyAsync(token, {
        secret: envs.jwtSecret,
      });
      const room = `order_chat_${data.orderId}`;
      // broadcast a todos en la sala EXCEPTO al emisor
      client.to(room).emit('typing', {
        orderId: data.orderId,
        userId: payload.sub,
        isTyping: data.isTyping,
      });
    } catch (e) {
      this.logger.error(`Error in typing: ${e.message}`);
    }
  }

  @SubscribeMessage('mark_messages_read')
  async handleMarkMessagesRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    const token = this.extractToken(client);
    if (!token) return;
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: envs.jwtSecret,
      });
      await this.notificationService.markMessagesRead(
        data.orderId,
        payload.sub,
      );
    } catch (e) {
      this.logger.error(`Error in mark_messages_read: ${e.message}`);
    }
  }

  @SubscribeMessage('mark_messages_delivered')
  async handleMarkMessagesDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { orderId: string },
  ) {
    const token = this.extractToken(client);
    if (!token) return;
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: envs.jwtSecret,
      });
      await this.notificationService.markMessagesDelivered(
        data.orderId,
        payload.sub,
      );
    } catch (e) {
      this.logger.error(`Error in mark_messages_delivered: ${e.message}`);
    }
  }

  @SubscribeMessage('join_store')
  async handleJoinStore(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string },
  ) {
    const room = `store_${data.storeId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);
  }

  @SubscribeMessage('leave_store')
  async handleLeaveStore(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { storeId: string },
  ) {
    const room = `store_${data.storeId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} left ${room}`);
  }

  // ─── Admin Badges ─────────────────────────────────────────────────────────

  @SubscribeMessage('join_admin_room')
  async handleJoinAdminRoom(@ConnectedSocket() client: Socket) {
    client.join('admin_room');
    this.logger.log(`Client ${client.id} joined admin_room via event`);
    const summary = await this.notificationService.getAdminBadgesSummary();
    client.emit('admin_badges_updated', summary);
  }

  async emitAdminBadgesUpdate() {
    try {
      const summary = await this.notificationService.getAdminBadgesSummary();
      this.server.to('admin_room').emit('admin_badges_updated', summary);
      this.logger.log(
        `Emitted admin_badges_updated to admin_room: ${JSON.stringify(summary)}`,
      );
    } catch (err) {
      this.logger.error(`Error in emitAdminBadgesUpdate: ${err.message}`);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private extractToken(client: Socket): string | null {
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.split(' ')[1];
    }
    const queryToken = client.handshake.query.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }
    const authToken = client.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      return authToken.replace('Bearer ', '');
    }
    return null;
  }

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user_${userId}`).emit(event, data);
    this.logger.log(`Event '${event}' → user_${userId}`);
  }

  sendToStore(storeId: string, event: string, data: any) {
    this.server.to(`store_${storeId}`).emit(event, data);
    this.logger.log(`Event '${event}' → store_${storeId}`);
  }

  sendToOrderRoom(orderId: string, event: string, data: any) {
    this.server.to(`order_chat_${orderId}`).emit(event, data);
    this.logger.log(`Event '${event}' → order_chat_${orderId}`);
  }
}
