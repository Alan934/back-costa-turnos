import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DateTime } from 'luxon';
import { SubscriptionStatus } from '@/common/enums';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { AdminMetricsDto } from './dto/admin-metrics.dto';

const MONTH_ES = [
  '',
  'Ene',
  'Feb',
  'Mar',
  'Abr',
  'May',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Oct',
  'Nov',
  'Dic',
];
const CHURNED = [SubscriptionStatus.Blocked, SubscriptionStatus.Cancelled];

/**
 * Metricas agregadas de la plataforma. Las series mensuales son best-effort
 * (no guardamos snapshots historicos): se derivan de createdAt/updatedAt de las
 * suscripciones. Cada professional tiene exactamente una suscripcion.
 */
@Injectable()
export class AdminMetricsService {
  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptions: Repository<Subscription>,
  ) {}

  async getMetrics(): Promise<AdminMetricsDto> {
    const subs = await this.subscriptions.find();
    const now = DateTime.now();
    const startOfThisMonth = now.startOf('month');

    const isChurned = (s: Subscription): boolean => CHURNED.includes(s.status);

    const totals = {
      activeProfessionals: subs.filter((s) => s.status === SubscriptionStatus.Active).length,
      mrrCents: subs
        .filter((s) => s.status === SubscriptionStatus.Active)
        .reduce((acc, s) => acc + s.amountCents, 0),
      newThisMonth: subs.filter((s) => DateTime.fromJSDate(s.createdAt) >= startOfThisMonth).length,
      churnThisMonth: subs.filter(
        (s) => isChurned(s) && DateTime.fromJSDate(s.updatedAt) >= startOfThisMonth,
      ).length,
    };

    const activeByMonth: AdminMetricsDto['activeByMonth'] = [];
    const mrrByMonth: AdminMetricsDto['mrrByMonth'] = [];
    const growthByMonth: AdminMetricsDto['growthByMonth'] = [];

    for (let i = 5; i >= 0; i--) {
      const month = now.minus({ months: i });
      const start = month.startOf('month');
      const end = month.endOf('month');
      const label = MONTH_ES[month.month];

      // Activos a fin de mes: creados antes del fin y no dados de baja antes del fin.
      const activeSet = subs.filter((s) => {
        const created = DateTime.fromJSDate(s.createdAt);
        const churnedBy = isChurned(s) && DateTime.fromJSDate(s.updatedAt) <= end;
        return created <= end && !churnedBy;
      });
      activeByMonth.push({ label, activos: activeSet.length });
      mrrByMonth.push({ label, cents: activeSet.reduce((acc, s) => acc + s.amountCents, 0) });

      const altas = subs.filter((s) => {
        const c = DateTime.fromJSDate(s.createdAt);
        return c >= start && c <= end;
      }).length;
      const bajas = subs.filter((s) => {
        if (!isChurned(s)) return false;
        const u = DateTime.fromJSDate(s.updatedAt);
        return u >= start && u <= end;
      }).length;
      growthByMonth.push({ label, altas, bajas });
    }

    return { totals, activeByMonth, mrrByMonth, growthByMonth };
  }
}
