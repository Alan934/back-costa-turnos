import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { ProfessionalsModule } from '@/modules/professionals/professionals.module';
import { AvailabilityModule } from '@/modules/availability/availability.module';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SubscriptionsModule } from '@/modules/subscriptions/subscriptions.module';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Appointment } from './entities/appointment.entity';
import { AppointmentsService } from './appointments.service';
import { AppointmentsController } from './appointments.controller';
import { PublicBookingController } from './public-booking.controller';
import { WaitingRoomGateway } from './waiting-room.gateway';

@Module({
  imports: [
    TypeOrmModule.forFeature([Appointment, Service, Staff, Payment]),
    IdentityModule,
    CatalogModule,
    ProfessionalsModule,
    AvailabilityModule,
    NotificationsModule,
    SubscriptionsModule,
  ],
  controllers: [AppointmentsController, PublicBookingController],
  providers: [AppointmentsService, WaitingRoomGateway],
  exports: [AppointmentsService],
})
export class AppointmentsModule {}
