import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Consent } from './entities/consent.entity';
import { AuditLog } from './entities/audit-log.entity';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';

/**
 * Global para que cualquier modulo pueda escribir auditoria via LegalService.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([Consent, AuditLog])],
  controllers: [LegalController],
  providers: [LegalService],
  exports: [LegalService],
})
export class LegalModule {}
