import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { AuthModule } from '@/modules/auth/auth.module';
import { Raffle } from './entities/raffle.entity';
import { RafflePrize } from './entities/raffle-prize.entity';
import { RaffleEntry } from './entities/raffle-entry.entity';
import { RafflesService } from './raffles.service';
import { RafflesController } from './raffles.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Raffle, RafflePrize, RaffleEntry]),
    IdentityModule,
    AuthModule,
  ],
  controllers: [RafflesController],
  providers: [RafflesService],
  exports: [RafflesService],
})
export class RafflesModule {}
