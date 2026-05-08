import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationGateway } from './notification.gateway';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { Notification } from './entities/notification.entity';
import { envs } from '../config/envs';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    JwtModule.register({
      secret: envs.jwtSecret,
      signOptions: { expiresIn: '1h' },
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationGateway, NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
