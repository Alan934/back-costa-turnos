import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { Raffle } from './raffle.entity';

@Entity('raffle_prize')
@Index('idx_raffle_prize_raffle', ['raffleId'])
export class RafflePrize extends BaseCreatedEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'raffle_id', type: 'uuid' })
  raffleId!: string;

  @ManyToOne(() => Raffle, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'raffle_id' })
  raffle?: Raffle;

  @ApiProperty()
  @Column({ type: 'text' })
  name!: string;

  /** Objeto en MinIO. */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ name: 'photo_key', type: 'text', nullable: true })
  photoKey!: string | null;

  @ApiProperty({ type: Number })
  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;
}
