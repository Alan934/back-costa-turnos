import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { RaffleStatus } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';

/**
 * Sorteo (fase 2, pero modelado por el vinculo con "reclamar cuenta").
 */
@Entity('raffle')
@Index('idx_raffle_tenant', ['professionalId'])
export class Raffle extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty()
  @Column({ type: 'text' })
  name!: string;

  @ApiProperty({ enum: RaffleStatus, enumName: 'RaffleStatus' })
  @Column({
    type: 'enum',
    enum: RaffleStatus,
    enumName: 'raffle_status',
    default: RaffleStatus.Draft,
  })
  status!: RaffleStatus;

  /** FK a raffle_entry (sin relacion para evitar ciclo de import). */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'winner_entry_id', type: 'uuid', nullable: true })
  winnerEntryId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;
}
