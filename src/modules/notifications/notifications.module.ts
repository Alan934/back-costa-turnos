import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { MailConfig } from '@/config/configuration';
import { Notification } from './entities/notification.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsProcessor } from './notifications.processor';
import { NotificationsController } from './notifications.controller';
import { NOTIFICATIONS_QUEUE } from './notifications.constants';
import { NOTIFICATION_SENDERS, NotificationSender } from './ports/notification-sender.port';
import { EmailStubSender } from './senders/email-stub.sender';
import { SmtpEmailSender } from './senders/smtp-email.sender';
import { WhatsappStubSender } from './senders/whatsapp-stub.sender';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification]),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
    IdentityModule,
  ],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    EmailStubSender,
    SmtpEmailSender,
    WhatsappStubSender,
    {
      // Email real (SMTP) si MAIL_HOST esta configurado; si no, stub que loguea.
      provide: NOTIFICATION_SENDERS,
      useFactory: (
        config: ConfigService,
        stubEmail: EmailStubSender,
        smtpEmail: SmtpEmailSender,
        whatsapp: WhatsappStubSender,
      ): NotificationSender[] => {
        const mail = config.getOrThrow<MailConfig>('mail');
        const email = mail.host ? smtpEmail : stubEmail;
        return [email, whatsapp];
      },
      inject: [ConfigService, EmailStubSender, SmtpEmailSender, WhatsappStubSender],
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
