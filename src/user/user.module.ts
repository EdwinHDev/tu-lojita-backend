import { Module, forwardRef } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';
import { MediationRequest } from 'src/store/entities/mediation-request.entity';
import { SuspensionAppeal } from './entities/suspension-appeal.entity';
import { UserSuspension } from './entities/user-suspension.entity';
import { NotificationModule } from 'src/notification/notification.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Company,
      Store,
      MediationRequest,
      SuspensionAppeal,
      UserSuspension,
    ]),
    forwardRef(() => NotificationModule),
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
