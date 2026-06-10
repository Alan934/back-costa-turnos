import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { MeService } from './me.service';
import { MeController } from './me.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Appointment, Service, Staff, Professional, Person])],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
