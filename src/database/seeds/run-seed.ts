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
import {
  DepositMode,
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
        defaultDepositMode: DepositMode.Hybrid,
        cancellationWindowHours: 24,
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

  // Servicios
  const serviceCount = await manager.count(Service, {
    where: { professionalId: professional.id },
  });
  if (serviceCount === 0) {
    await manager.save([
      manager.create(Service, {
        professionalId: professional.id,
        name: 'Corte de pelo',
        durationMinutes: 30,
        priceCents: 500_000,
        depositMode: DepositMode.Hybrid,
        depositAmountCents: 200_000,
      }),
      manager.create(Service, {
        professionalId: professional.id,
        name: 'Color',
        durationMinutes: 90,
        priceCents: 1_500_000,
        depositMode: DepositMode.Required,
        depositAmountCents: 500_000,
      }),
    ]);
    console.log('Servicios creados: Corte (hibrido), Color (required)');
  }

  // Horarios: lunes a viernes 9-18 con break 13-14
  const ruleCount = await manager.count(ScheduleRule, { where: { staffId: staff.id } });
  if (ruleCount === 0) {
    const rules: ScheduleRule[] = [];
    for (let day = 1; day <= 5; day++) {
      rules.push(
        manager.create(ScheduleRule, {
          staffId: staff.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '18:00',
          kind: ScheduleRuleKind.Work,
        }),
        manager.create(ScheduleRule, {
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

  await dataSource.destroy();
  console.log('Seed completado.');
}

seed().catch((err) => {
  console.error('Error en el seed:', err);
  process.exit(1);
});
