import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { Injectable, Logger } from '@nestjs/common';
import { envs } from '../config/envs';

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

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(@ConnectedSocket() client: Socket) {
    try {
      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn(
          `Client ${client.id} connected without token, disconnecting...`,
        );
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: envs.jwtSecret,
      });

      const userId = payload.sub;
      client.join(`user_${userId}`);
      this.logger.log(
        `Client ${client.id} (User: ${userId}) connected and joined room user_${userId}`,
      );
    } catch (error) {
      this.logger.error(
        `Connection authentication failed for client ${client.id}: ${error.message}`,
      );
      client.disconnect();
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client ${client.id} disconnected`);
  }

  private extractToken(client: Socket): string | null {
    // Check Authorization header or query parameter
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.split(' ')[0] === 'Bearer') {
      return authHeader.split(' ')[1];
    }

    const token = client.handshake.query.token;
    if (token && typeof token === 'string') {
      return token;
    }

    // Check handshake.auth (Common in Flutter socket_io_client)
    const authToken = client.handshake.auth?.token;
    if (authToken && typeof authToken === 'string') {
      // Remove 'Bearer ' if present
      return authToken.replace('Bearer ', '');
    }

    return null;
  }

  sendToUser(userId: string, event: string, data: any) {
    this.server.to(`user_${userId}`).emit(event, data);
    this.logger.log(`Event '${event}' sent to user_${userId}`);
  }
}
