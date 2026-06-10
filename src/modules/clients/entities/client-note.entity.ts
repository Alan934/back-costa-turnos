import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { ProfessionalClient } from './professional-client.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';

/**
 * Notas privadas del profesional sobre un cliente. NUNCA visibles al cliente.
 */
@Entity('client_note')
@Index('idx_client_note_pc', ['professionalClientId'])
export class ClientNote extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'professional_client_id', type: 'uuid' })
  professionalClientId!: string;

  @ManyToOne(() => ProfessionalClient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'professional_client_id' })
  professionalClient?: ProfessionalClient;

  @ApiPropertyOptional({ format: 'uuid', nullable: true })
  @Column({ name: 'author_staff_id', type: 'uuid', nullable: true })
  authorStaffId!: string | null;

  @ManyToOne(() => Staff, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_staff_id' })
  authorStaff?: Staff | null;

  @ApiProperty()
  @Column({ type: 'text' })
  body!: string;
}
