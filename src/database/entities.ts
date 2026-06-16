import { Account } from '@/modules/identity/entities/account.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import { ComercioInvitation } from '@/modules/comercios/entities/comercio-invitation.entity';
import { VerificationToken } from '@/modules/auth/entities/verification-token.entity';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { FichaField } from '@/modules/clients/entities/ficha-field.entity';
import { ClientNote } from '@/modules/clients/entities/client-note.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { ServiceCombinationRule } from '@/modules/catalog/entities/service-combination-rule.entity';
import { ScheduleRule } from '@/modules/availability/entities/schedule-rule.entity';
import { ScheduleRuleService } from '@/modules/availability/entities/schedule-rule-service.entity';
import { TimeOff } from '@/modules/availability/entities/time-off.entity';
import { StaffCalendarIntegration } from '@/modules/availability/entities/staff-calendar-integration.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { AppointmentAddon } from '@/modules/appointments/entities/appointment-addon.entity';
import { PendingBooking } from '@/modules/appointments/entities/pending-booking.entity';
import { Payment } from '@/modules/payments/entities/payment.entity';
import { WaitlistEntry } from '@/modules/waitlist/entities/waitlist-entry.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { SubscriptionPayment } from '@/modules/subscriptions/entities/subscription-payment.entity';
import { Notification } from '@/modules/notifications/entities/notification.entity';
import { Raffle } from '@/modules/raffles/entities/raffle.entity';
import { RafflePrize } from '@/modules/raffles/entities/raffle-prize.entity';
import { RaffleEntry } from '@/modules/raffles/entities/raffle-entry.entity';
import { Consent } from '@/modules/legal/entities/consent.entity';
import { AuditLog } from '@/modules/legal/entities/audit-log.entity';
import { FileObject } from '@/modules/files/entities/file.entity';

/** Lista unica de entidades para el DataSource y TypeOrmModule. */
export const entities = [
  Account,
  Person,
  Professional,
  Staff,
  Comercio,
  Membership,
  ComercioInvitation,
  VerificationToken,
  ProfessionalClient,
  FichaField,
  ClientNote,
  Service,
  ServiceCombinationRule,
  ScheduleRule,
  ScheduleRuleService,
  TimeOff,
  StaffCalendarIntegration,
  Appointment,
  AppointmentAddon,
  PendingBooking,
  Payment,
  WaitlistEntry,
  Subscription,
  SubscriptionPayment,
  Notification,
  Raffle,
  RafflePrize,
  RaffleEntry,
  Consent,
  AuditLog,
  FileObject,
];
