import { NotificationChannel } from '@/common/enums';

export interface OutboundNotification {
  to: string | null;
  channel: NotificationChannel;
  type: string;
  payload: Record<string, unknown>;
}

/**
 * Puerto de envio de notificaciones. Implementaciones reales (email/WhatsApp)
 * se enchufan luego sin tocar la logica de negocio.
 */
export interface NotificationSender {
  readonly channel: NotificationChannel;
  send(notification: OutboundNotification): Promise<void>;
}

export const NOTIFICATION_SENDERS = 'NOTIFICATION_SENDERS';
