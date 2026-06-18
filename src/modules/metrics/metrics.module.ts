import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Person, Professional, Payment])],
  controllers: [MetricsController],
  providers: [MetricsService],
})
export class MetricsModule {}
