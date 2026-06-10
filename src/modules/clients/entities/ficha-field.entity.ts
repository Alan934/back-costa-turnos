import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { FichaFieldType } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';

/**
 * Definiciones de los campos que cada profesional arma para sus fichas.
 */
@Entity('ficha_field')
@Index('idx_ficha_field_tenant', ['professionalId'])
export class FichaField extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  @ApiProperty()
  @Column({ type: 'text' })
  label!: string;

  @ApiProperty({ enum: FichaFieldType, enumName: 'FichaFieldType' })
  @Column({
    type: 'enum',
    enum: FichaFieldType,
    enumName: 'ficha_field_type',
  })
  type!: FichaFieldType;

  /** Para type=select. */
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, nullable: true })
  @Column({ type: 'jsonb', nullable: true })
  options!: string[] | null;

  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_required', type: 'boolean', default: false })
  isRequired!: boolean;

  /** Capa "ficha" (true) visible al cliente vs privada (false). */
  @ApiProperty({ type: Boolean })
  @Column({ name: 'is_visible_to_client', type: 'boolean', default: true })
  isVisibleToClient!: boolean;

  @ApiProperty({ type: Number })
  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder!: number;
}
