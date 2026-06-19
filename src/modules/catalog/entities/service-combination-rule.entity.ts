import { Column, Entity, Index, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { BaseEntity } from '@/common/base.entity';
import { CombinationRuleType, DiscountType } from '@/common/enums';
import { Service } from './service.entity';

/**
 * Regla de combinación entre dos servicios del mismo profesional-en-comercio.
 *
 * Tipos:
 * - enables:  seleccionar sourceService habilita targetService como add-on opcional
 * - excludes: sourceService y targetService son mutuamente excluyentes (bidireccional por convención)
 * - discount: seleccionar sourceService aplica un descuento sobre targetService
 * - free_with: targetService viene gratis al seleccionar sourceService (enables + precio 0)
 */
@Entity('service_combination_rule')
@Unique('uq_combination_rule', ['sourceServiceId', 'targetServiceId', 'ruleType'])
@Index('idx_combination_rule_source', ['sourceServiceId'])
@Index('idx_combination_rule_membership', ['membershipId'])
export class ServiceCombinationRule extends BaseEntity {
  @ApiProperty({ format: 'uuid' })
  @Column({ name: 'membership_id', type: 'uuid' })
  membershipId!: string;

  @ApiProperty({ format: 'uuid', description: 'Servicio trigger (el que se selecciona primero)' })
  @Column({ name: 'source_service_id', type: 'uuid' })
  sourceServiceId!: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_service_id' })
  sourceService?: Service;

  @ApiProperty({ format: 'uuid', description: 'Servicio afectado por la regla' })
  @Column({ name: 'target_service_id', type: 'uuid' })
  targetServiceId!: string;

  @ManyToOne(() => Service, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_service_id' })
  targetService?: Service;

  /**
   * Descripción opcional de la relación: aclara qué se realiza al combinar estos
   * servicios o qué tener en cuenta para relacionarlos.
   */
  @ApiPropertyOptional({ type: String, nullable: true })
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ApiProperty({ enum: CombinationRuleType, enumName: 'CombinationRuleType' })
  @Column({
    name: 'rule_type',
    type: 'enum',
    enum: CombinationRuleType,
    enumName: 'combination_rule_type',
  })
  ruleType!: CombinationRuleType;

  @ApiPropertyOptional({
    type: Number,
    nullable: true,
    description: 'Monto del descuento (centavos). Solo para ruleType=discount',
  })
  @Column({ name: 'discount_amount_cents', type: 'integer', nullable: true })
  discountAmountCents!: number | null;

  @ApiPropertyOptional({
    enum: DiscountType,
    enumName: 'DiscountType',
    nullable: true,
    description: 'Tipo de descuento. Solo para ruleType=discount',
  })
  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
    enumName: 'discount_type',
    nullable: true,
  })
  discountType!: DiscountType | null;
}
