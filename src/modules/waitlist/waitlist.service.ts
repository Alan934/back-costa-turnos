import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationChannel, NotificationType, WaitlistStatus } from '@/common/enums';
import { NotificationsService } from '@/modules/notifications/notifications.service';
import { WaitlistEntry } from './entities/waitlist-entry.entity';
import { CreateWaitlistDto } from './dto/waitlist.dto';

@Injectable()
export class WaitlistService {
  constructor(
    @InjectRepository(WaitlistEntry)
    private readonly entries: Repository<WaitlistEntry>,
    private readonly notifications: NotificationsService,
  ) {}

  list(tenantId: string): Promise<WaitlistEntry[]> {
    return this.entries.find({
      where: { professionalId: tenantId },
      order: { createdAt: 'ASC' },
    });
  }

  create(tenantId: string, dto: CreateWaitlistDto): Promise<WaitlistEntry> {
    const entry = this.entries.create({
      professionalId: tenantId,
      personId: dto.personId,
      staffId: dto.staffId ?? null,
      serviceId: dto.serviceId ?? null,
      desiredFrom: new Date(dto.desiredFrom),
      desiredTo: new Date(dto.desiredTo),
      status: WaitlistStatus.Waiting,
    });
    return this.entries.save(entry);
  }

  private async findById(tenantId: string, id: string): Promise<WaitlistEntry> {
    const entry = await this.entries.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!entry) throw new NotFoundException('Entrada de lista de espera no encontrada');
    return entry;
  }

  /** Marca como notificada y encola un aviso al cliente (hueco disponible). */
  async notify(tenantId: string, id: string): Promise<WaitlistEntry> {
    const entry = await this.findById(tenantId, id);
    entry.status = WaitlistStatus.Notified;
    const saved = await this.entries.save(entry);
    await this.notifications.enqueue({
      professionalId: tenantId,
      personId: entry.personId,
      channel: NotificationChannel.Email,
      type: NotificationType.Waitlist,
      payload: { waitlistEntryId: entry.id },
    });
    return saved;
  }

  async convert(tenantId: string, id: string): Promise<WaitlistEntry> {
    const entry = await this.findById(tenantId, id);
    entry.status = WaitlistStatus.Converted;
    return this.entries.save(entry);
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const res = await this.entries.delete({ id, professionalId: tenantId });
    if (!res.affected) throw new NotFoundException('Entrada no encontrada');
  }
}
