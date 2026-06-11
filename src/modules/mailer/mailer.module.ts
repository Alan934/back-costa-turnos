import { Module } from '@nestjs/common';
import { MailerService } from './mailer.service';

/**
 * Envio de emails transaccionales (codigos de verificacion). Reusa MailConfig.
 */
@Module({
  providers: [MailerService],
  exports: [MailerService],
})
export class MailerModule {}
