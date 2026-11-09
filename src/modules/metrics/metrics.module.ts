import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { ComercioOwnerGuard } from '@/common/guards/comercio-owner.guard';
import { ScheduleRule } from '@/modules/availability/entities/schedule-rule.entity';
import { TimeOff } from '@/modules/availability/entities/time-off.entity';
import { HolidaysModule } from '@/modules/holidays/holidays.module';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { ComercioMetricsController } from './comercio-metrics.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Appointment,
      Professional,
      Payment,
      Service,
      Membership,
      Comercio,
      ScheduleRule,
      TimeOff,
    ]),
    HolidaysModule,
  ],
  controllers: [MetricsController, ComercioMetricsController],
  providers: [MetricsService, ComercioOwnerGuard],
})
export class MetricsModule {}
