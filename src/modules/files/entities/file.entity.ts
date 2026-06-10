import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';

/**
 * Metadatos de objetos en MinIO (fotos de ficha, premios, exports).
 * Bucket privado + URLs firmadas temporales; object_key aleatorio.
 */
@Entity('file')
@Index('idx_file_owner', ['ownerType', 'ownerId'])
@Index('idx_file_tenant', ['professionalId'])
export class FileObject extends BaseCreatedEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_id', type: 'uuid' })
  professionalId!: string;

  @ManyToOne(() => Professional, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_id' })
  professional?: Professional;

  /** ficha / prize / export */
  @ApiProperty()
  @Column({ name: 'owner_type', type: 'text' })
  ownerType!: string;

  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  /** Clave aleatoria en MinIO (no el nombre original). */
  @ApiProperty()
  @Column({ name: 'object_key', type: 'text' })
  objectKey!: string;

  @ApiProperty()
  @Column({ type: 'text' })
  mime!: string;

  @ApiProperty()
  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: string;
}
