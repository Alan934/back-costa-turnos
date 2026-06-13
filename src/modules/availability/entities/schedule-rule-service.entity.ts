import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { ScheduleRule } from './schedule-rule.entity';

/**
 * Mapeo regla-de-horario -> servicio. Una regla SIN filas en esta tabla aplica a
 * TODOS los servicios de la membresia; con filas, aplica SOLO a esos servicios.
 */
@Entity('schedule_rule_service')
@Unique('uq_schedule_rule_service', ['scheduleRuleId', 'serviceId'])
@Index('idx_schedule_rule_service_rule', ['scheduleRuleId'])
@Index('idx_schedule_rule_service_service', ['serviceId'])
export class ScheduleRuleService extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'schedule_rule_id', type: 'uuid' })
  scheduleRuleId!: string;

  @ManyToOne(() => ScheduleRule, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'schedule_rule_id' })
  scheduleRule?: ScheduleRule;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'service_id', type: 'uuid' })
  serviceId!: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'service_id' })
  service?: Service;
}
