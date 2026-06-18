import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfessionalsModule } from '@/modules/professionals/professionals.module';
import { CatalogModule } from '@/modules/catalog/catalog.module';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { PendingBooking } from '@/modules/appointments/entities/pending-booking.entity';
import { ScheduleRule } from './entities/schedule-rule.entity';
import { ScheduleRuleService } from './entities/schedule-rule-service.entity';
import { TimeOff } from './entities/time-off.entity';
import { StaffCalendarIntegration } from './entities/staff-calendar-integration.entity';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';
import { ComercioAvailabilityController } from './comercio-availability.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ScheduleRule,
      ScheduleRuleService,
      TimeOff,
      StaffCalendarIntegration,
      Appointment,
      PendingBooking,
    ]),
    ProfessionalsModule,
    CatalogModule,
  ],
  controllers: [AvailabilityController, ComercioAvailabilityController],
  providers: [AvailabilityService],
  exports: [AvailabilityService],
})
export class AvailabilityModule {}
