import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { Raffle } from './raffle.entity';
import { Person } from '@/modules/identity/entities/person.entity';

@Entity('raffle_entry')
@Unique('uq_raffle_entry_number', ['raffleId', 'number'])
@Index('idx_raffle_entry_raffle', ['raffleId'])
export class RaffleEntry extends BaseCreatedEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'raffle_id', type: 'uuid' })
  raffleId!: string;

  @ManyToOne(() => Raffle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raffle_id' })
  raffle?: Raffle;

  /** NULL = entrada solo por numero (no registrado). */
  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'person_id', type: 'uuid', nullable: true })
  personId!: string | null;

  @ManyToOne(() => Person, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'person_id' })
  person?: Person | null;

  @ApiProperty({ type: Number })
  @Column({ type: 'integer' })
  number!: number;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'text', nullable: true })
  label!: string | null;
}
