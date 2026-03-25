import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { Company } from 'src/company/entities/company.entity';
import { Store } from 'src/store/entities/store.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Company, Store])
  ],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService]
})
export class UserModule { }
