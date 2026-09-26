import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { Notification } from './entities/notification.entity';
import { ChatMessage } from './entities/chat-message.entity';
import { UserDevice } from './entities/user-device.entity';
import { Order } from 'src/order/entities/order.entity';
import { User } from 'src/user/entities/user.entity';
import { Report } from 'src/report/entities/report.entity';
import { OrderDispute } from 'src/order-dispute/entities/order-dispute.entity';
import { Store } from 'src/store/entities/store.entity';
import { CommissionPaymentReport } from 'src/commission/entities/commission-payment-report.entity';
import { envs } from '../config/envs';
import { FirebaseAdminProvider } from './firebase-admin.provider';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Notification,
      ChatMessage,
      Order,
      UserDevice,
      User,
      Report,
      OrderDispute,
      Store,
      CommissionPaymentReport,
    ]),
    JwtModule.register({
      secret: envs.jwtSecret,
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationService, FirebaseAdminProvider],
  exports: [NotificationService, NotificationGateway],
})
export class NotificationModule {}

