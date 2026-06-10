import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Professional, Subscription]), SubscriptionsModule],
  controllers: [AdminController],
  providers: [AdminMetricsService],
})
export class AdminModule {}
