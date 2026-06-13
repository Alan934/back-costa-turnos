import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DateTime } from 'luxon';
import { AppModule } from '@/app.module';
import { AppointmentStatus, CancellationReason } from '@/common/enums';

/**
 * E2E del flujo de reserva. Requiere Postgres + Redis levantados y la migracion
 * aplicada (docker-compose up + npm run migration:run). Cubre:
 *  - registro/login + onboarding del professional
 *  - catalogo + horarios + calculo de slots
 *  - reserva provisional (hibrido) y desplazamiento (bump) al pagar la sena
 */
describe('Booking flow (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  let accessToken: string;
  let slug: string;
  let staffId: string;
  let serviceId: string;
  let slotStart: string;

  const email = `pro-${Date.now()}@test.com`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registra un professional (cuenta + comercio-de-uno + trial)', async () => {
    slug = `pro-${Date.now()}`;
    const reg = await http
      .post('/auth/register-professional')
      .send({ email, password: 'secret123', fullName: 'Pro Test', businessName: 'Test Shop', slug })
      .expect(201);
    accessToken = reg.body.accessToken;
    expect(accessToken).toBeDefined();
  });

  it('crea staff implicito, servicio hibrido y horarios', async () => {
    const staffRes = await http
      .get('/v1/professionals/staff')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    staffId = staffRes.body[0].id;

    const svc = await http
      .post('/v1/services')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Corte',
        durationMinutes: 30,
        priceCents: 500000,
        allowDeposit: true,
        allowFullPayment: true,
        allowNoPayment: true,
        depositAmountCents: 200000,
      })
      .expect(201);
    serviceId = svc.body.id;

    // horario para todos los dias 09-18
    for (let d = 0; d <= 6; d++) {
      await http
        .post(`/v1/availability/staff/${staffId}/schedule`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ dayOfWeek: d, startTime: '09:00', endTime: '18:00' })
        .expect(201);
    }
  });

  it('devuelve slots libres', async () => {
    const from = DateTime.now().plus({ days: 1 }).toISODate();
    const to = DateTime.now().plus({ days: 1 }).toISODate();
    const res = await http
      .get(`/v1/availability/slots`)
      .query({ staffId, serviceId, from, to })
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThan(0);
    slotStart = res.body[0].startAt;
  });

  it('reserva provisional y luego es desplazada por un pago de sena', async () => {
    // 1) reserva provisional (sin sena) via pagina publica
    const prov = await http
      .post(`/r/${slug}/book`)
      .send({ staffId, serviceId, startAt: slotStart, fullName: 'Cliente A' })
      .expect(201);
    expect(prov.body.isProvisional).toBe(true);
    const provId = prov.body.id;

    // 2) otro cliente toma el mismo slot pagando sena -> bump
    const withDeposit = await http
      .post(`/v1/appointments/with-deposit`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        staffId,
        serviceId,
        startAt: slotStart,
        fullName: 'Cliente B',
        method: 'cash',
      })
      .expect(201);
    expect(withDeposit.body.appointment.status).toBe(AppointmentStatus.Confirmed);
    expect(withDeposit.body.appointment.isProvisional).toBe(false);

    // 3) el provisional quedo cancelado (bumped)
    const bumped = await http
      .get(`/v1/appointments/${provId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(bumped.body.status).toBe(AppointmentStatus.Cancelled);
    expect(bumped.body.cancellationReason).toBe(CancellationReason.Bumped);
  });
});
