/**
 * Enums del dominio. Los nombres de los tipos enum en Postgres se definen
 * en la migracion inicial; aca viven los valores que comparten entidades,
 * DTOs y logica de negocio.
 */

/** Roles de autorizacion (no es una columna; deriva de account + memberships). */
export enum AppRole {
  PlatformAdmin = 'platform_admin',
  Professional = 'professional',
  Staff = 'staff',
  Client = 'client',
}

export enum AccountStatus {
  Active = 'active',
  Blocked = 'blocked',
}

export enum VerificationPurpose {
  EmailVerify = 'email_verify',
  AccountClaim = 'account_claim',
  PasswordReset = 'password_reset',
  Otp = 'otp',
}

export enum DepositMode {
  None = 'none',
  Required = 'required',
  Hybrid = 'hybrid',
}

export enum ProfessionalClientStatus {
  Active = 'active',
  Archived = 'archived',
}

export enum FichaFieldType {
  Text = 'text',
  Number = 'number',
  Date = 'date',
  Select = 'select',
  Boolean = 'boolean',
  Photo = 'photo',
}

export enum ScheduleRuleKind {
  Work = 'work',
  Break = 'break',
}

export enum CalendarProvider {
  Google = 'google',
}

export enum AppointmentStatus {
  Requested = 'requested',
  Confirmed = 'confirmed',
  InProgress = 'in_progress',
  Done = 'done',
  NoShow = 'no_show',
  Cancelled = 'cancelled',
}

export enum CancellationReason {
  Client = 'client',
  Professional = 'professional',
  Bumped = 'bumped',
  NoShow = 'no_show',
}

export enum CreatedVia {
  ClientSelf = 'client_self',
  Professional = 'professional',
}

export enum PaymentType {
  Deposit = 'deposit',
  Service = 'service',
}

/** Opción de pago elegida por el cliente al reservar pagando. */
export enum PaymentOption {
  Deposit = 'deposit',
  Full = 'full',
}

export enum PaymentMethod {
  Cash = 'cash',
  MercadoPago = 'mercadopago',
}

export enum PaymentStatus {
  Pending = 'pending',
  Paid = 'paid',
  Refunded = 'refunded',
  Failed = 'failed',
}

export enum WaitlistStatus {
  Waiting = 'waiting',
  Notified = 'notified',
  Converted = 'converted',
  Expired = 'expired',
}

export enum SubscriptionStatus {
  Trial = 'trial',
  Active = 'active',
  PastDue = 'past_due',
  Grace = 'grace',
  Blocked = 'blocked',
  Cancelled = 'cancelled',
}

export enum SubscriptionPaymentStatus {
  Paid = 'paid',
  Failed = 'failed',
}

export enum NotificationChannel {
  Email = 'email',
  Whatsapp = 'whatsapp',
}

export enum NotificationType {
  Reminder = 'reminder',
  Waitlist = 'waitlist',
  Bumped = 'bumped',
  Deposit = 'deposit',
  Subscription = 'subscription',
}

export enum NotificationStatus {
  Queued = 'queued',
  Sent = 'sent',
  Failed = 'failed',
}

export enum RaffleStatus {
  Draft = 'draft',
  Running = 'running',
  Finished = 'finished',
}

export enum ConsentType {
  PrivacyPolicy = 'privacy_policy',
  Terms = 'terms',
  DataProcessing = 'data_processing',
}
