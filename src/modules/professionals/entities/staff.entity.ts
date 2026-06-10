import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { Account } from '@/modules/identity/entities/account.entity';
import { Professional } from './professional.entity';

/**
 * Cada persona/sillon que atiende dentro de un professional.
 * Para un profesional solo, se crea uno automatico.
 */
@Entity('staff')
@Index('idx_staff_professional', ['professionalId'])
export class Staff extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  /** NULL si el sillon no tiene login propio. */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  @ManyToOne(() => Account, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'account_id' })
  account?: Account | null;

  @ApiProperty()
  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;
}
