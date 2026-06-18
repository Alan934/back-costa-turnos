import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { CashClosingService } from './cash-closing.service';
import { CashClosingController } from './cash-closing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Payment, Service, Person, Professional])],
  controllers: [CashClosingController],
  providers: [CashClosingService],
})
export class CashClosingModule {}
