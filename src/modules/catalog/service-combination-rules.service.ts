import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { CombinationRuleType, DiscountType } from '@/common/enums';
import { Service } from './entities/service.entity';
import { ServiceMembership } from './entities/service-membership.entity';
import { ServiceCombinationRule } from './entities/service-combination-rule.entity';
import { CreateCombinationRuleDto } from './dto/service-combination-rule.dto';

export interface AddonPricing {
  service: Service;
  priceAtBookingCents: number;
  discountAppliedCents: number;
  isFree: boolean;
}

@Injectable()
export class ServiceCombinationRulesService {
  constructor(
    @InjectRepository(ServiceCombinationRule)
    private readonly rules: Repository<ServiceCombinationRule>,
    @InjectRepository(Service)
    private readonly services: Repository<Service>,
    @InjectRepository(ServiceMembership)
    private readonly serviceMemberships: Repository<ServiceMembership>,
  ) {}

  /** Servicio asignado a la membresía (vía service_membership), o null. */
  private async findAssignedService(
    membershipId: string,
    serviceId: string,
  ): Promise<Service | null> {
    const sm = await this.serviceMemberships.findOne({
      where: { membershipId, serviceId },
      relations: { service: true },
    });
    return sm?.service ?? null;
  }

  listByMembership(membershipId: string): Promise<ServiceCombinationRule[]> {
    return this.rules.find({
      where: { membershipId },
      relations: ['sourceService', 'targetService'],
      order: { createdAt: 'ASC' },
    });
  }

  /** Reglas donde sourceService = serviceId (las que aplica el cliente al elegir ese servicio). */
  listBySourceService(
    membershipId: string,
    sourceServiceId: string,
  ): Promise<ServiceCombinationRule[]> {
    return this.rules.find({
      where: { membershipId, sourceServiceId },
      relations: ['targetService'],
      order: { ruleType: 'ASC' },
    });
  }

  async create(
    membershipId: string,
    dto: CreateCombinationRuleDto,
  ): Promise<ServiceCombinationRule> {
    if (dto.sourceServiceId === dto.targetServiceId) {
      throw new BadRequestException('Un servicio no puede tener una regla consigo mismo');
    }
    const [source, target] = await Promise.all([
      this.findAssignedService(membershipId, dto.sourceServiceId),
      this.findAssignedService(membershipId, dto.targetServiceId),
    ]);
    if (!source) throw new NotFoundException('Servicio fuente no ofrecido por este profesional');
    if (!target) throw new NotFoundException('Servicio destino no ofrecido por este profesional');

    if (dto.ruleType === CombinationRuleType.Discount) {
      if (dto.discountAmountCents == null || dto.discountType == null) {
        throw new BadRequestException(
          'discountAmountCents y discountType son requeridos para reglas de tipo discount',
        );
      }
      if (dto.discountType === DiscountType.Percentage && dto.discountAmountCents > 10000) {
        throw new BadRequestException('El porcentaje de descuento no puede superar 10000 (100%)');
      }
    }

    try {
      const rule = this.rules.create({
        membershipId,
        sourceServiceId: dto.sourceServiceId,
        targetServiceId: dto.targetServiceId,
        ruleType: dto.ruleType,
        discountAmountCents: dto.discountAmountCents ?? null,
        discountType: dto.discountType ?? null,
      });
      return await this.rules.save(rule);
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('Ya existe una regla de este tipo entre estos servicios');
      }
      throw err;
    }
  }

  async delete(membershipId: string, id: string): Promise<void> {
    const res = await this.rules.delete({ id, membershipId });
    if (!res.affected) throw new NotFoundException('Regla no encontrada');
  }

  /**
   * Valida los servicios addon seleccionados contra las reglas del servicio primario
   * y devuelve la lista de addons con sus precios finales.
   *
   * Reglas validadas:
   * - enables/free_with: cada addon debe ser habilitado por el servicio primario
   * - excludes: ningún par de servicios seleccionados puede estar mutuamente excluido
   * - discount/free_with: se aplica automáticamente en el precio del addon
   */
  async resolveAddons(
    membershipId: string,
    primaryService: Service,
    addonServiceIds: string[],
  ): Promise<AddonPricing[]> {
    if (addonServiceIds.length === 0) return [];

    const unique = [...new Set(addonServiceIds)];

    const assignment = await this.serviceMemberships.find({
      where: { membershipId, serviceId: In(unique) },
      relations: { service: true },
    });
    const addonServices = assignment
      .map((sm) => sm.service)
      .filter((s): s is Service => !!s && s.isActive);
    if (addonServices.length !== unique.length) {
      throw new BadRequestException(
        'Algún servicio adicional no existe, no lo ofrece este profesional o está inactivo',
      );
    }
    if (addonServices.some((s) => s.id === primaryService.id)) {
      throw new BadRequestException('El servicio primario no puede incluirse como adicional');
    }

    // Carga todas las reglas que involucran al servicio primario como fuente.
    const allRules = await this.rules.find({
      where: { membershipId, sourceServiceId: primaryService.id },
    });

    const allSelectedIds = [primaryService.id, ...unique];

    for (const addon of addonServices) {
      // Cada addon debe tener al menos una regla enables/free_with del servicio primario.
      const hasEnabler = allRules.some(
        (r) =>
          r.targetServiceId === addon.id &&
          (r.ruleType === CombinationRuleType.Enables ||
            r.ruleType === CombinationRuleType.FreeWith),
      );
      if (!hasEnabler) {
        throw new BadRequestException(
          `El servicio "${addon.name}" no puede agregarse: no está habilitado por el servicio seleccionado`,
        );
      }
    }

    // Valida exclusiones entre cualquier par de servicios seleccionados.
    const excludeRules = await this.rules.find({
      where: [
        {
          membershipId,
          ruleType: CombinationRuleType.Excludes,
          sourceServiceId: In(allSelectedIds),
        },
        {
          membershipId,
          ruleType: CombinationRuleType.Excludes,
          targetServiceId: In(allSelectedIds),
        },
      ],
    });
    for (const rule of excludeRules) {
      const srcSelected = allSelectedIds.includes(rule.sourceServiceId);
      const tgtSelected = allSelectedIds.includes(rule.targetServiceId);
      if (srcSelected && tgtSelected) {
        const srcName =
          rule.sourceServiceId === primaryService.id
            ? primaryService.name
            : (addonServices.find((s) => s.id === rule.sourceServiceId)?.name ??
              rule.sourceServiceId);
        const tgtName =
          rule.targetServiceId === primaryService.id
            ? primaryService.name
            : (addonServices.find((s) => s.id === rule.targetServiceId)?.name ??
              rule.targetServiceId);
        throw new BadRequestException(
          `Los servicios "${srcName}" y "${tgtName}" no pueden seleccionarse juntos`,
        );
      }
    }

    return addonServices.map((addon) => this.applyPricing(addon, primaryService.id, allRules));
  }

  private applyPricing(
    addon: Service,
    primaryServiceId: string,
    rules: ServiceCombinationRule[],
  ): AddonPricing {
    // FREE_WITH tiene prioridad sobre DISCOUNT.
    const freeRule = rules.find(
      (r) =>
        r.sourceServiceId === primaryServiceId &&
        r.targetServiceId === addon.id &&
        r.ruleType === CombinationRuleType.FreeWith,
    );
    if (freeRule) {
      return {
        service: addon,
        priceAtBookingCents: addon.priceCents,
        discountAppliedCents: addon.priceCents,
        isFree: true,
      };
    }

    const discountRule = rules.find(
      (r) =>
        r.sourceServiceId === primaryServiceId &&
        r.targetServiceId === addon.id &&
        r.ruleType === CombinationRuleType.Discount,
    );
    if (discountRule && discountRule.discountAmountCents != null && discountRule.discountType) {
      const discount =
        discountRule.discountType === DiscountType.Percentage
          ? Math.round((addon.priceCents * discountRule.discountAmountCents) / 10000)
          : discountRule.discountAmountCents;
      const applied = Math.min(discount, addon.priceCents);
      return {
        service: addon,
        priceAtBookingCents: addon.priceCents,
        discountAppliedCents: applied,
        isFree: false,
      };
    }

    return {
      service: addon,
      priceAtBookingCents: addon.priceCents,
      discountAppliedCents: 0,
      isFree: false,
    };
  }
}
