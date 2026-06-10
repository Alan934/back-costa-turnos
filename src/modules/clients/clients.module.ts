import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { ProfessionalClient } from './entities/professional-client.entity';
import { FichaField } from './entities/ficha-field.entity';
import { ClientNote } from './entities/client-note.entity';
import { ClientsService } from './clients.service';
import { ClientsController } from './clients.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ProfessionalClient, FichaField, ClientNote]), IdentityModule],
  controllers: [ClientsController],
  providers: [ClientsService],
  exports: [ClientsService, TypeOrmModule],
})
export class ClientsModule {}
