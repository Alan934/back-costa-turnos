import { Column, Entity, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';

/**
 * Feriado nacional. Catálogo GLOBAL (no pertenece a ningún tenant), sincronizado desde la
 * API pública de argentinadatos.com. Una fila por fecha.
 */
@Entity('holiday')
@Index('uq_holiday_date', ['date'], { unique: true })
export class Holiday extends BaseEntity {
  /** Fecha del feriado (YYYY-MM-DD), sin zona horaria. */
  @ApiProperty({ example: '2026-05-25', description: 'YYYY-MM-DD' })
  @Column({ type: 'date' })
  date!: string;

  @ApiProperty({ example: 'Día de la Revolución de Mayo' })
  @Column({ type: 'text' })
  name!: string;

  /** Tipo según la API: inamovible | trasladable | puente | nolaborable (texto libre por si suman otros). */
  @ApiProperty({ example: 'inamovible' })
  @Column({ type: 'text', default: 'inamovible' })
  kind!: string;
}
