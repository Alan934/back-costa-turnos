import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { ProfessionalsModule } from '@/modules/professionals/professionals.module';
import { AvailabilityModule } from '@/modules/availability/availability.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { PaymentsModule } from '@/modules/payments/payments.module';
import { Service } from '@/modules/catalog/entities/service.entity';
import { ServiceCombinationRule } from '@/modules/catalog/entities/service-combination-rule.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { Appointment } from './entities/appointment.entity';
import { AppointmentAddon } from './entities/appointment-addon.entity';
import { PendingBooking } from './entities/pending-booking.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PublicBookingController } from './public-booking.controller';
import { WaitingRoomGateway } from './waiting-room.gateway';
import { AppointmentsJobs } from './appointments.jobs';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      AppointmentAddon,
      PendingBooking,
      Service,
      ServiceCombinationRule,
      Staff,
      Professional,
      Payment,
      ProfessionalClient,
    ]),
    IdentityModule,
    CatalogModule,
    ProfessionalsModule,
    AvailabilityModule,
    NotificationsModule,
    SubscriptionsModule,
    PaymentsModule,
  ],
  controllers: [AppointmentsController, PublicBookingController],
  providers: [AppointmentsService, WaitingRoomGateway, AppointmentsJobs],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
