import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { IdentityModule } from '@/modules/identity/identity.module';
import { ProfessionalsModule } from '@/modules/professionals/professionals.module';
import { ClientsModule } from '@/modules/clients/clients.module';
import { ComerciosModule } from '@/modules/comercios/comercios.module';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Account } from '@/modules/identity/entities/account.entity';
import { AdminController } from './admin.controller';
import { AdminMetricsService } from './admin-metrics.service';
import { AdminDeletionService } from './admin-deletion.service';
import { AdminListService } from './admin-list.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Professional,
      Subscription,
      ProfessionalClient,
      Comercio,
      Membership,
      Account,
    ]),
    SubscriptionsModule,
    AuthModule,
    IdentityModule,
    ProfessionalsModule,
    ClientsModule,
    ComerciosModule,
  ],
  controllers: [AdminController],
  providers: [AdminMetricsService, AdminDeletionService, AdminListService],
})
export class AdminModule {}
