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
        this.logger.warn(`Client ${client.id} connected without token, disconnecting...`);
        client.disconnect();
        return;
      }
      const payload = await this.jwtService.verifyAsync(token, { secret: envs.jwtSecret });
      const userId = payload.sub;
      client.join(`user_${userId}`);
      this.logger.log(`Client ${client.id} (User: ${userId}) connected → room user_${userId}`);
    } catch (error) {
      this.logger.error(`Auth failed for client ${client.id}: ${error.message}`);
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
    const isActive = await this.notificationService.isOrderActiveForChat(data.orderId);
    if (!isActive) {
      client.emit('chat_closed', { orderId: data.orderId, reason: 'resolved' });
      return;
    }

    const room = `order_chat_${data.orderId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} joined ${room}`);

    // 1. Enviar historial al cliente que se une
    const history = await this.notificationService.getChatHistory(data.orderId);
    client.emit('chat_history', history);

    // 2. Marcar los mensajes entrantes como entregados
    try {
      const token = this.extractToken(client);
      if (token) {
        const payload = await this.jwtService.verifyAsync(token, { secret: envs.jwtSecret });
        await this.notificationService.markMessagesDelivered(data.orderId, payload.sub);
      }
    } catch (e) {
      this.logger.error(`Error marking delivered on join: ${e.message}`);
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
    @MessageBody() data: { orderId: string; content: string },
  ) {
    const isActive = await this.notificationService.isOrderActiveForChat(data.orderId);
    if (!isActive) {
      client.emit('chat_closed', { orderId: data.orderId, reason: 'resolved' });
      return;
    }

    const token = this.extractToken(client);
    if (!token) return;
    try {
      const payload = await this.jwtService.verifyAsync(token, { secret: envs.jwtSecret });
      // saveMessage internamente llama a sendToOrderRoom('new_chat_message', ...)
      await this.notificationService.saveMessage(data.orderId, payload.sub, data.content);
    } catch (e) {
      this.logger.error(`Error in send_message: ${e.message}`);
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
      const payload = await this.jwtService.verifyAsync(token, { secret: envs.jwtSecret });
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
      const payload = await this.jwtService.verifyAsync(token, { secret: envs.jwtSecret });
      await this.notificationService.markMessagesRead(data.orderId, payload.sub);
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
      const payload = await this.jwtService.verifyAsync(token, { secret: envs.jwtSecret });
      await this.notificationService.markMessagesDelivered(data.orderId, payload.sub);
    } catch (e) {
      this.logger.error(`Error in mark_messages_delivered: ${e.message}`);
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

  sendToOrderRoom(orderId: string, event: string, data: any) {
    this.server.to(`order_chat_${orderId}`).emit(event, data);
    this.logger.log(`Event '${event}' → order_chat_${orderId}`);
  }
}
