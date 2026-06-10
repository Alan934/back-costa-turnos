import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Job diario que mueve las suscripciones por sus estados
 * (active -> past_due -> grace -> blocked) y dispara avisos "por vencer".
 */
@Injectable()
export class SubscriptionsJobs {
  private readonly logger = new Logger(SubscriptionsJobs.name);

  constructor(private readonly subscriptions: SubscriptionsService) {}

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleStateTransitions(): Promise<void> {
    this.logger.debug('Ejecutando transiciones de suscripcion');
    await this.subscriptions.runStateTransitions();
  }
}
