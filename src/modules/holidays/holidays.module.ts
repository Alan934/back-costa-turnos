import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Holiday } from './entities/holiday.entity';
import { MembershipHolidayOverride } from './entities/membership-holiday-override.entity';
import { HolidaysService } from './holidays.service';
import { HolidaysJobs } from './holidays.jobs';
import { HolidaysController } from './holidays.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Holiday, MembershipHolidayOverride])],
  controllers: [HolidaysController],
  providers: [HolidaysService, HolidaysJobs],
  exports: [HolidaysService],
})
export class HolidaysModule {}
