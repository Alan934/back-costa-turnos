import {
  CreateDateColumn,
  DeleteDateColumn,
  PrimaryColumn,
  UpdateDateColumn,
  BeforeInsert,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { uuidv7 } from 'uuidv7';

/**
 * Entidad base con PK uuid v7 (ordenable por tiempo) generada en la app,
 * y timestamps en timestamptz (UTC).
 *
 * Incluye soft-delete (`deletedAt`): `repo.softRemove()` / `softDelete()` setean
 * `deleted_at` en vez de borrar, y TypeORM excluye automaticamente los registros
 * borrados de los `find` (salvo que se pase `withDeleted: true`). Heredarlo aqui
 * habilita la capacidad para todas las entidades; solo se usa realmente en las que
 * el admin puede eliminar (professional/comercio/person/membership/...). Las tablas
 * historicas (appointment/payment/subscription) lo tienen pero nunca se soft-borran.
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

  /** NULL = activo. Con valor = soft-borrado (oculto de los `find` normales). */
  @ApiPropertyOptional({ type: String, format: 'date-time', nullable: true })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

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
