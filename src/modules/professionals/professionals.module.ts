import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Professional } from './entities/professional.entity';
import { Staff } from './entities/staff.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { ProfessionalsService } from './professionals.service';
import { ProfessionalsController } from './professionals.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Professional, Staff, Subscription])],
  controllers: [ProfessionalsController],
  providers: [ProfessionalsService],
  exports: [ProfessionalsService, TypeOrmModule],
})
export class ProfessionalsModule {}
