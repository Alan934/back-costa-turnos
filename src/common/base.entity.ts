import { CreateDateColumn, PrimaryColumn, UpdateDateColumn, BeforeInsert } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { uuidv7 } from 'uuidv7';

/**
 * Entidad base con PK uuid v7 (ordenable por tiempo) generada en la app,
 * y timestamps en timestamptz (UTC).
 */
export abstract class BaseEntity {
  @ApiProperty({ format: 'uuid', example: '0190c0de-7a3b-7c2e-9f4a-1b2c3d4e5f60' })
  @PrimaryColumn('uuid')
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}

/**
 * Variante sin updated_at, para entidades append-only / de historial
 * (audit_log, subscription_payment, verification_token, consent...).
 */
export abstract class BaseCreatedEntity {
  @ApiProperty({ format: 'uuid', example: '0190c0de-7a3b-7c2e-9f4a-1b2c3d4e5f60' })
  @PrimaryColumn('uuid')
  id!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  generateId(): void {
    if (!this.id) {
      this.id = uuidv7();
    }
  }
}
