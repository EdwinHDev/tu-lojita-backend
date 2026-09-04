import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { Notification } from './entities/notification.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { Order } from 'src/order/entities/order.entity';
import { envs } from '../config/envs';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, ChatMessage, Order]),
    JwtModule.register({
      secret: envs.jwtSecret,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
