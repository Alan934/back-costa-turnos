import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity';
import { Person } from './entities/person.entity';
import { AccountsService } from './accounts.service';
import { PersonsService } from './persons.service';

@Module({
  imports: [TypeOrmModule.forFeature([Account, Person])],
  providers: [AccountsService, PersonsService],
  exports: [AccountsService, PersonsService, TypeOrmModule],
})
export class IdentityModule {}
