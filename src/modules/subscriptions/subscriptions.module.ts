import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { Account } from '@/modules/identity/entities/account.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Subscription } from './entities/subscription.entity';
import { SubscriptionPayment } from './entities/subscription-payment.entity';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsJobs } from './subscriptions.jobs';
import { SubscriptionsController } from './subscriptions.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([Subscription, SubscriptionPayment, Professional, Account]),
    NotificationsModule,
    PaymentsModule,
  ],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionsJobs],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
