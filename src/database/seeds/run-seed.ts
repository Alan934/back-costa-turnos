import 'reflect-metadata';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';
import dataSource from '../data-source';
import { Account } from '@/modules/identity/entities/account.entity';
import { Person } from '@/modules/identity/entities/person.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { ScheduleRule } from '@/modules/availability/entities/schedule-rule.entity';
import { Subscription } from '@/modules/subscriptions/entities/subscription.entity';
import { ProfessionalClient } from '@/modules/clients/entities/professional-client.entity';
import { Comercio } from '@/modules/comercios/entities/comercio.entity';
import { Membership } from '@/modules/comercios/entities/membership.entity';
import {
  MembershipStatus,
  ProfessionalClientStatus,
  ScheduleRuleKind,
  SubscriptionStatus,
} from '@/common/enums';

/**
 * Seed de desarrollo: un platform admin + un professional demo con staff,
 * servicios (uno hibrido con sena), horarios y suscripcion en trial.
 *
 * Correr con: npm run seed
 */
/**
 * Crea servicios (con "sin pago" habilitado) + un horario L-V 09-17 para una
 * membresía, si todavía no tiene. Idempotente. `staffId` = sillón legacy del pro.
 */
async function ensureMembershipCatalog(
  manager: typeof dataSource.manager,
  membership: Membership,
  staffId: string,
  services: Array<{ name: string; durationMinutes: number; priceCents: number }>,
): Promise<void> {
  const existing = await manager.count(Service, { where: { membershipId: membership.id } });
  if (existing === 0) {
    await manager.save(
      services.map((s) =>
        manager.create(Service, {
          professionalId: membership.professionalId,
          membershipId: membership.id,
          name: s.name,
          durationMinutes: s.durationMinutes,
          priceCents: s.priceCents,
          allowNoPayment: true,
        }),
      ),
    );
  }
  const ruleCount = await manager.count(ScheduleRule, { where: { membershipId: membership.id } });
  if (ruleCount === 0) {
    const rules: ScheduleRule[] = [];
    for (let day = 1; day <= 5; day++) {
      rules.push(
        manager.create(ScheduleRule, {
          membershipId: membership.id,
          staffId,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '17:00',
          kind: ScheduleRuleKind.Work,
        }),
      );
    }
    await manager.save(rules);
  }
}

async function seed(): Promise<void> {
  await dataSource.initialize();
  const manager = dataSource.manager;

  // Platform admin (el dueno)
  const adminEmail = 'admin@turnerito.app';
  let admin = await manager.findOne(Account, { where: { email: adminEmail } });
  if (!admin) {
    admin = await manager.save(
      manager.create(Account, {
        email: adminEmail,
        passwordHash: await argon2.hash('admin12345'),
        isClaimed: true,
        isPlatformAdmin: true,
        emailVerifiedAt: new Date(),
      }),
    );
    console.log(`Platform admin creado: ${adminEmail} / admin12345`);
  }

  // Professional demo
  const proEmail = 'dueno@peluqueria.com';
  let proAccount = await manager.findOne(Account, { where: { email: proEmail } });
  if (!proAccount) {
    proAccount = await manager.save(
      manager.create(Account, {
        email: proEmail,
        passwordHash: await argon2.hash('dueno12345'),
        isClaimed: true,
        emailVerifiedAt: new Date(),
      }),
    );
  }

  let professional = await manager.findOne(Professional, {
    where: { accountId: proAccount.id },
  });
  if (!professional) {
    professional = await manager.save(
      manager.create(Professional, {
        accountId: proAccount.id,
        businessName: 'Peluqueria Mi Pueblo',
        slug: 'mi-peluqueria',
        timezone: 'America/Argentina/Buenos_Aires',
        cancellationWindowHours: 24,
        rescheduleWindowHours: 24,
      }),
    );

    await manager.save(
      manager.create(Person, {
        accountId: proAccount.id,
        fullName: 'Juan Dueno',
        email: proEmail,
      }),
    );

    const trialDays = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS ?? '15', 10);
    const priceCents = parseInt(process.env.SUBSCRIPTION_PRICE_CENTS ?? '1100000', 10);
    const now = new Date();
    const trialEnds = new Date(now.getTime() + trialDays * 86_400_000);
    await manager.save(
      manager.create(Subscription, {
        professionalId: professional.id,
        status: SubscriptionStatus.Trial,
        trialEndsAt: trialEnds,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnds,
        amountCents: priceCents,
      }),
    );

    console.log(`Professional creado: ${proEmail} / dueno12345 (slug: mi-peluqueria)`);
  }

  // Staff
  let staff = await manager.findOne(Staff, {
    where: { professionalId: professional.id },
  });
  if (!staff) {
    staff = await manager.save(
      manager.create(Staff, {
        professionalId: professional.id,
        accountId: proAccount.id,
        displayName: 'Sillon 1 - Maria',
        isActive: true,
      }),
    );
  }

  // ---- Comercio-de-uno del profesional demo + su membresía (debe existir antes
  // de servicios/horarios, que ahora cuelgan de la membresía). ----
  let personalComercio = await manager.findOne(Comercio, { where: { slug: professional.slug } });
  if (!personalComercio) {
    personalComercio = await manager.save(
      manager.create(Comercio, {
        accountId: proAccount.id,
        name: professional.businessName,
        slug: professional.slug,
        address: professional.address ?? null,
        timezone: professional.timezone,
        isPersonal: true,
      }),
    );
  }
  let personalMembership = await manager.findOne(Membership, {
    where: { professionalId: professional.id, comercioId: personalComercio.id },
  });
  if (!personalMembership) {
    personalMembership = await manager.save(
      manager.create(Membership, {
        professionalId: professional.id,
        comercioId: personalComercio.id,
        status: MembershipStatus.Active,
      }),
    );
    console.log('Comercio-de-uno del profesional demo + membresía creados');
  }

  // Cliente demo: account (login) + person + membresia con el professional.
  const clientEmail = 'cliente@demo.com';
  let clientAccount = await manager.findOne(Account, { where: { email: clientEmail } });
  if (!clientAccount) {
    clientAccount = await manager.save(
      manager.create(Account, {
        email: clientEmail,
        passwordHash: await argon2.hash('cliente12345'),
        isClaimed: true,
        emailVerifiedAt: new Date(),
      }),
    );
  }

  let clientPerson = await manager.findOne(Person, {
    where: { accountId: clientAccount.id },
  });
  if (!clientPerson) {
    clientPerson = await manager.save(
      manager.create(Person, {
        accountId: clientAccount.id,
        fullName: 'Ana Cliente',
        email: clientEmail,
      }),
    );
  }

  const membership = await manager.findOne(ProfessionalClient, {
    where: { professionalId: professional.id, personId: clientPerson.id },
  });
  if (!membership) {
    await manager.save(
      manager.create(ProfessionalClient, {
        professionalId: professional.id,
        personId: clientPerson.id,
        status: ProfessionalClientStatus.Active,
      }),
    );
    console.log(`Cliente creado: ${clientEmail} / cliente12345 (vinculado a ${professional.slug})`);
  }

  // Servicios (cuelgan de la membresía del comercio-de-uno).
  const serviceCount = await manager.count(Service, {
    where: { membershipId: personalMembership.id },
  });
  if (serviceCount === 0) {
    await manager.save([
      // Corte: permite las 3 opciones (con seña, pago completo y sin pago).
      manager.create(Service, {
        professionalId: professional.id,
        membershipId: personalMembership.id,
        name: 'Corte de pelo',
        durationMinutes: 30,
        priceCents: 500_000,
        allowDeposit: true,
        allowFullPayment: true,
        allowNoPayment: true,
        depositAmountCents: 200_000,
      }),
      // Color: exige pago (seña o total), no permite reservar sin pagar.
      manager.create(Service, {
        professionalId: professional.id,
        membershipId: personalMembership.id,
        name: 'Color',
        durationMinutes: 90,
        priceCents: 1_500_000,
        allowDeposit: true,
        allowFullPayment: true,
        allowNoPayment: false,
        depositAmountCents: 500_000,
      }),
    ]);
    console.log('Servicios creados: Corte (todas las opciones), Color (con pago)');
  }

  // Horarios: lunes a viernes 9-18 con break 13-14 (por membresía; staff_id legacy).
  const ruleCount = await manager.count(ScheduleRule, {
    where: { membershipId: personalMembership.id },
  });
  if (ruleCount === 0) {
    const rules: ScheduleRule[] = [];
    for (let day = 1; day <= 5; day++) {
      rules.push(
        manager.create(ScheduleRule, {
          membershipId: personalMembership.id,
          staffId: staff.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '18:00',
          kind: ScheduleRuleKind.Work,
        }),
        manager.create(ScheduleRule, {
          membershipId: personalMembership.id,
          staffId: staff.id,
          dayOfWeek: day,
          startTime: '13:00',
          endTime: '14:00',
          kind: ScheduleRuleKind.Break,
        }),
      );
    }
    await manager.save(rules);
    console.log(`Horarios creados (L-V 09-18, break 13-14). Hoy: ${DateTime.now().toISODate()}`);
  }

  // ---- Otro comercio: "Peluquería Centro" con un comercial; el profesional demo
  // es miembro (muestra que un profesional puede trabajar en varios comercios). ----
  const comercialEmail = 'comercial@centro.com';
  let comercialAccount = await manager.findOne(Account, { where: { email: comercialEmail } });
  if (!comercialAccount) {
    comercialAccount = await manager.save(
      manager.create(Account, {
        email: comercialEmail,
        passwordHash: await argon2.hash('comercial12345'),
        isClaimed: true,
        emailVerifiedAt: new Date(),
      }),
    );
  }
  let centro = await manager.findOne(Comercio, { where: { slug: 'centro' } });
  if (!centro) {
    centro = await manager.save(
      manager.create(Comercio, {
        accountId: comercialAccount.id,
        name: 'Peluquería Centro',
        slug: 'centro',
        address: 'San Martín 100, Mendoza',
        timezone: 'America/Argentina/Buenos_Aires',
        isPersonal: false,
      }),
    );
    console.log(
      `Comercial creado: ${comercialEmail} / comercial12345 (comercio: Peluquería Centro)`,
    );
  }

  // Membresía del profesional demo en Centro + sus servicios/horario en ese comercio.
  let demoInCentro = await manager.findOne(Membership, {
    where: { professionalId: professional.id, comercioId: centro.id },
  });
  if (!demoInCentro) {
    demoInCentro = await manager.save(
      manager.create(Membership, {
        professionalId: professional.id,
        comercioId: centro.id,
        status: MembershipStatus.Active,
      }),
    );
    console.log('El profesional demo también es miembro de Peluquería Centro');
  }
  await ensureMembershipCatalog(manager, demoInCentro, staff.id, [
    { name: 'Corte (en Centro)', durationMinutes: 30, priceCents: 700_000 },
    { name: 'Peinado (en Centro)', durationMinutes: 45, priceCents: 900_000 },
  ]);

  // Segundo profesional (Marta), también miembro de Centro, con sus propios
  // servicios/precios y una dirección propia (atiende a domicilio).
  const martaEmail = 'marta@centro.com';
  let martaAccount = await manager.findOne(Account, { where: { email: martaEmail } });
  if (!martaAccount) {
    martaAccount = await manager.save(
      manager.create(Account, {
        email: martaEmail,
        passwordHash: await argon2.hash('marta12345'),
        isClaimed: true,
        emailVerifiedAt: new Date(),
      }),
    );
  }
  let marta = await manager.findOne(Professional, { where: { accountId: martaAccount.id } });
  if (!marta) {
    marta = await manager.save(
      manager.create(Professional, {
        accountId: martaAccount.id,
        businessName: 'Marta Estilista',
        slug: 'marta-estilista',
        timezone: 'America/Argentina/Buenos_Aires',
        cancellationWindowHours: 24,
        rescheduleWindowHours: 24,
      }),
    );
    await manager.save(
      manager.create(Person, {
        accountId: martaAccount.id,
        fullName: 'Marta Estilista',
        email: martaEmail,
      }),
    );
    // Comercio-de-uno + suscripción trial de Marta.
    const martaComercio = await manager.save(
      manager.create(Comercio, {
        accountId: martaAccount.id,
        name: marta.businessName,
        slug: marta.slug,
        timezone: marta.timezone,
        isPersonal: true,
      }),
    );
    await manager.save(
      manager.create(Membership, {
        professionalId: marta.id,
        comercioId: martaComercio.id,
        status: MembershipStatus.Active,
      }),
    );
    const trialDays = parseInt(process.env.SUBSCRIPTION_TRIAL_DAYS ?? '15', 10);
    const now = new Date();
    const trialEnds = new Date(now.getTime() + trialDays * 86_400_000);
    await manager.save(
      manager.create(Subscription, {
        professionalId: marta.id,
        status: SubscriptionStatus.Trial,
        trialEndsAt: trialEnds,
        currentPeriodStart: now,
        currentPeriodEnd: trialEnds,
        amountCents: parseInt(process.env.SUBSCRIPTION_PRICE_CENTS ?? '1100000', 10),
      }),
    );
    console.log(`Profesional creado: ${martaEmail} / marta12345 (slug: marta-estilista)`);
  }
  // Staff de Marta (sillón).
  let martaStaff = await manager.findOne(Staff, { where: { professionalId: marta.id } });
  if (!martaStaff) {
    martaStaff = await manager.save(
      manager.create(Staff, {
        professionalId: marta.id,
        accountId: martaAccount.id,
        displayName: 'Marta',
        isActive: true,
      }),
    );
  }
  // Membresía de Marta en Centro con dirección propia + sus servicios/horario.
  let martaInCentro = await manager.findOne(Membership, {
    where: { professionalId: marta.id, comercioId: centro.id },
  });
  if (!martaInCentro) {
    martaInCentro = await manager.save(
      manager.create(Membership, {
        professionalId: marta.id,
        comercioId: centro.id,
        status: MembershipStatus.Active,
        address: 'A domicilio (zona centro)',
      }),
    );
    console.log('Marta también es miembro de Peluquería Centro (con dirección propia)');
  }
  await ensureMembershipCatalog(manager, martaInCentro, martaStaff.id, [
    { name: 'Coloración', durationMinutes: 90, priceCents: 1_800_000 },
    { name: 'Brushing', durationMinutes: 40, priceCents: 600_000 },
  ]);

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en el seed:', err);
  process.exit(1);
});
