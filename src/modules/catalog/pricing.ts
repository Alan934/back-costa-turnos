import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Service, ServicePriceBreakdown, ServicePricing } from './entities/service.entity';

/** IVA efectivo de un servicio: override del servicio o, si es null, default del profesional. */
export function resolveServiceVat(
  service: Pick<Service, 'vatPercent' | 'vatChargedToClient'>,
  professional?: Pick<Professional, 'defaultVatPercent' | 'vatChargedToClient'> | null,
): { percent: number; chargedToClient: boolean } {
  return {
    percent: service.vatPercent ?? professional?.defaultVatPercent ?? 0,
    chargedToClient: service.vatChargedToClient ?? professional?.vatChargedToClient ?? true,
  };
}

/** Desglosa un monto base en base/IVA/total. El IVA solo se suma si se le cobra al cliente. */
export function computePrice(
  baseCents: number,
  percent: number,
  chargedToClient: boolean,
): ServicePriceBreakdown {
  const vatAmountCents = chargedToClient ? Math.round((baseCents * percent) / 100) : 0;
  return { baseCents, vatAmountCents, totalCents: baseCents + vatAmountCents };
}

/** Precios con/sin IVA del servicio (pago completo y seña) para mostrar al cliente. */
export function buildServicePricing(
  service: Service,
  professional?: Pick<Professional, 'defaultVatPercent' | 'vatChargedToClient'> | null,
): ServicePricing {
  const { percent, chargedToClient } = resolveServiceVat(service, professional);
  return {
    vatPercent: percent,
    vatChargedToClient: chargedToClient,
    full: computePrice(service.priceCents, percent, chargedToClient),
    deposit:
      service.depositAmountCents != null
        ? computePrice(service.depositAmountCents, percent, chargedToClient)
        : null,
  };
}
