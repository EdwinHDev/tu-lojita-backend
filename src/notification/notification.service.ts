import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './entities/notification.entity';
import { NotificationGateway } from './notification.gateway';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepository: Repository<Notification>,
    private readonly notificationGateway: NotificationGateway,
  ) {}

  async create(data: {
    userId: string;
    title: string;
    body: string;
    type: NotificationType;
    targetId?: string;
  }) {
    try {
      const notification = this.notificationRepository.create(data);
      const savedNotification =
        await this.notificationRepository.save(notification);

      // Emit via WebSocket
      this.notificationGateway.sendToUser(
        data.userId,
        'new_notification',
        savedNotification,
      );

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
}
