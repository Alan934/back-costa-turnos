import { Payment } from '../entities/payment.entity';

/**
 * Puerto para que el webhook de pagos (PaymentsService) confirme/cancele una
 * reserva sin importar AppointmentsModule (evita dependencia circular: es
 * AppointmentsModule el que importa PaymentsModule). La implementación
 * (AppointmentsService) se registra en runtime vía
 * PaymentsService.registerAppointmentConfirmer().
 */
export interface AppointmentConfirmer {
  /**
   * Crea el Appointment a partir del pending_booking del pago acreditado y borra
   * el pending. Idempotente: si el pago ya tiene appointment, no hace nada.
   */
  confirmPaidBooking(payment: Payment): Promise<void>;

  /** Libera el hold (borra el pending_booking) de un pago fallido/cancelado. */
  releasePending(paymentId: string): Promise<void>;
}
