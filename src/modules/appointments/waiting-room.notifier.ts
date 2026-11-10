import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PushService } from '@/modules/push/push.service';
import { Appointment } from './entities/appointment.entity';
import { WaitingRoomDto } from './dto/waiting-room.dto';

/**
 * Avisos push de avance de la fila: "estás segundo" y "sos el siguiente".
 *
 * Se evalúa en cada cambio de la sala (ver `emitWaitingRoom`), no con un cron: el
 * aviso sale en el momento en que la fila avanza. Cada etapa se avisa UNA vez por
 * turno (`notified_*_at`); si el profesional lo manda al final, las marcas se
 * limpian y vuelve a recibir los avisos al reacercarse.
 *
 * El aviso de "es tu turno" no pasa por acá: sale directo de `call()` / `start()`.
 */
@Injectable()
export class WaitingRoomNotifier {
  private readonly logger = new Logger(WaitingRoomNotifier.name);

  constructor(
    @InjectRepository(Appointment)
    private readonly appointments: Repository<Appointment>,
    private readonly push: PushService,
  ) {}

  async notifyProgress(room: WaitingRoomDto): Promise<void> {
    if (!this.push.enabled) return;
    const now = Date.now();
    // Solo los dos primeros que NO están ausentes: a quien se fue "10 minutos" no se
    // lo molesta; a la vuelta, la posición se recalcula sola.
    // Tampoco a quien ya fue llamado: "¡Es tu turno!" ya lo dijo todo y un "sos el siguiente"
    // detrás sería ruido contradictorio.
    const candidates = room.queue.filter(
      (i) =>
        i.position <= 1 && !i.calledAt && !(i.awayUntil && new Date(i.awayUntil).getTime() > now),
    );
    if (candidates.length === 0) return;

    const subscribed = await this.push.subscribedAppointmentIds(
      candidates.map((c) => c.appointmentId),
    );
    const targets = candidates.filter((c) => subscribed.has(c.appointmentId));
    if (targets.length === 0) return;

    const rows = await this.appointments.find({
      where: { id: In(targets.map((t) => t.appointmentId)) },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    for (const item of targets) {
      const apt = byId.get(item.appointmentId);
      if (!apt?.publicToken) continue;
      const url = `/sala/t/${apt.publicToken}`;

      if (item.position === 0 && !apt.notifiedNextAt) {
        const sent = await this.push.sendToAppointment(apt.id, {
          title: 'Sos el siguiente',
          body: `Prepará tu turno con ${room.staffName}: ya te toca.`,
          url,
          tag: 'sala-progreso',
          vibrate: [200, 100, 200],
        });
        if (sent > 0) await this.appointments.update(apt.id, { notifiedNextAt: new Date() });
      } else if (item.position === 1 && !apt.notifiedSecondAt) {
        const sent = await this.push.sendToAppointment(apt.id, {
          title: 'Estás segundo',
          body: `Hay 1 persona antes que vos con ${room.staffName}. Andá acercándote.`,
          url,
          tag: 'sala-progreso',
        });
        if (sent > 0) await this.appointments.update(apt.id, { notifiedSecondAt: new Date() });
      }
    }
  }

  /** Para el llamado explícito del profesional ("pasá, te toca"). */
  async notifyCalled(appointment: Appointment, staffName: string): Promise<number> {
    if (!appointment.publicToken) return 0;
    return this.push.sendToAppointment(appointment.id, {
      title: '¡Es tu turno!',
      body: `${staffName} te está llamando. Pasá ahora.`,
      url: `/sala/t/${appointment.publicToken}`,
      tag: 'sala-llamado',
      vibrate: [300, 150, 300, 150, 300],
      // Si el celular estaba sin señal, a los 3 minutos el llamado ya no tiene sentido.
      ttl: 180,
    });
  }

  /**
   * El profesional empezó a atender a quien ya había llamado. Reemplaza (misma `tag`) al "¡Es tu
   * turno!" que queda fijo en la bandeja, para que no siga ahí pidiendo que se acerque.
   */
  async notifyServing(appointment: Appointment, staffName: string): Promise<number> {
    if (!appointment.publicToken) return 0;
    return this.push.sendToAppointment(appointment.id, {
      title: 'Te están atendiendo',
      body: `${staffName} ya te está atendiendo.`,
      url: `/sala/t/${appointment.publicToken}`,
      tag: 'sala-llamado',
      silent: true,
      ttl: 180,
    });
  }
}
