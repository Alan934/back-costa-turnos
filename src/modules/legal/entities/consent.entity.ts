import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseCreatedEntity } from '@/common/base.entity';
import { ConsentType } from '@/common/enums';
import { Account } from '@/modules/identity/entities/account.entity';

/**
 * Consentimiento (Ley 25.326): politica de privacidad, terminos, tratamiento de datos.
 */
@Entity('consent')
@Index('idx_consent_account', ['accountId'])
export class Consent extends BaseCreatedEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'account_id', type: 'uuid' })
  accountId!: string;

  @ManyToOne(() => Account, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account?: Account;

  @ApiProperty({ enum: ConsentType, enumName: 'ConsentType' })
  @Column({
    type: 'enum',
    enum: ConsentType,
    enumName: 'consent_type',
  })
  type!: ConsentType;

  @ApiProperty()
  @Column({ type: 'text' })
  version!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @Column({ name: 'accepted_at', type: 'timestamptz' })
  acceptedAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  @Column({ type: 'inet', nullable: true })
  ip!: string | null;
}
