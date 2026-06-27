import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { DateTime } from 'luxon';
import { AppModule } from '@/app.module';
import { AppointmentStatus, CancellationReason } from '@/common/enums';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { PAYMENT_PROVIDER } from '@/modules/payments/ports/payment-provider.port';
import { MercadoPagoStubProvider } from '@/modules/payments/providers/mercadopago-stub.provider';

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
    })
      .overrideProvider(PAYMENT_PROVIDER)
      .useClass(MercadoPagoStubProvider)
      .compile();

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

    // Conectar MP antes de crear el servicio con opciones de pago online
    const proRepo = app.get<Repository<Professional>>(getRepositoryToken(Professional));
    const pro = await proRepo.findOne({ where: {}, order: { createdAt: 'DESC' } });
    await proRepo.update(
      { id: pro!.id },
      { mpConnectedAt: new Date(), mpUserId: 'test-seller', mpAccessToken: 'TEST-stub-token' },
    );

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
        allowCash: true,
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
    // 0) habilitar reservas provisionales en la membresía (default: false).
    const mine = await http
      .get('/v1/comercios/memberships/mine')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    const comercioId = mine.body[0].comercioId;
    await http
      .patch(`/v1/comercios/${comercioId}/membership`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ allowProvisionalBookings: true })
      .expect(200);

    // 1) reserva provisional (sin sena) via pagina publica
    const prov = await http
      .post(`/r/${slug}/book`)
      .send({ staffId, serviceId, startAt: slotStart, fullName: 'Cliente A', phone: '2612000001' })
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

  describe('F4: reserva con MercadoPago crea el turno recién al acreditar', () => {
    let mpSlot: string;
    let mpPaymentId: string;
    // Ref de MP único por corrida: uq_payment_mp_ref es global y la DB local es
    // persistente, así que un id fijo colisionaría entre ejecuciones.
    const mpExternalId = `mp-test-${Date.now()}`;

    it('reserva con method=mercadopago NO crea el turno (appointment null) y devuelve initPoint', async () => {
      // Tomar un slot distinto al del bloque anterior (dia +2) para no chocar.
      const day = DateTime.now().plus({ days: 2 }).toISODate();
      const slots = await http
        .get(`/v1/availability/slots`)
        .query({ staffId, serviceId, from: day, to: day })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      mpSlot = slots.body[0].startAt;

      const res = await http
        .post(`/r/${slug}/book-with-deposit`)
        .send({
          serviceId,
          startAt: mpSlot,
          fullName: 'Cliente MP',
          phone: '2612000002',
          method: 'mercadopago',
        })
        .expect(201);

      expect(res.body.appointment).toBeNull();
      expect(res.body.mpInitPoint).toContain('mercadopago');
      expect(res.body.payment.status).toBe('pending');
      mpPaymentId = res.body.payment.id;

      // El turno no aparece en la agenda todavia.
      const list = await http
        .get('/v1/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(list.body.some((a: { startAt: string }) => a.startAt === mpSlot)).toBe(false);
    });

    it('el horario queda en hold: una reserva casual al mismo slot da 409', async () => {
      await http
        .post(`/r/${slug}/book`)
        .send({ staffId, serviceId, startAt: mpSlot, fullName: 'Colado', phone: '2612000003' })
        .expect(409);
    });

    it('el webhook aprobado crea el turno (confirmed) y libera el hold', async () => {
      await http
        .post('/v1/payments/mp/webhook')
        .send({ external_reference: `pay:${mpPaymentId}`, status: 'approved', id: mpExternalId })
        .expect(200);

      const list = await http
        .get('/v1/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const created = list.body.find((a: { startAt: string }) => a.startAt === mpSlot);
      expect(created).toBeDefined();
      expect(created.status).toBe(AppointmentStatus.Confirmed);
      expect(created.isProvisional).toBe(false);
    });

    it('reenviar el mismo webhook es idempotente (no duplica el turno)', async () => {
      await http
        .post('/v1/payments/mp/webhook')
        .send({ external_reference: `pay:${mpPaymentId}`, status: 'approved', id: mpExternalId })
        .expect(200);

      const list = await http
        .get('/v1/appointments')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const matches = list.body.filter((a: { startAt: string }) => a.startAt === mpSlot);
      expect(matches.length).toBe(1);
    });
  });

  describe('Cliente logueado: el turno se ata a su cuenta y aparece en /me/appointments', () => {
    let clientToken: string;
    let bookedSlot: string;
    const clientEmail = `cli-${Date.now()}@test.com`;

    it('reserva con sesión: el turno se asocia a la cuenta (no al teléfono tipeado)', async () => {
      const reg = await http
        .post('/auth/register')
        .send({ email: clientEmail, password: 'secret123', fullName: 'Cliente Logueado' })
        .expect(201);
      clientToken = reg.body.accessToken;
      expect(clientToken).toBeDefined();

      // Slot libre (día +3) para no chocar con los bloques anteriores.
      const day = DateTime.now().plus({ days: 3 }).toISODate();
      const slots = await http
        .get(`/v1/availability/slots`)
        .query({ staffId, serviceId, from: day, to: day })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      bookedSlot = slots.body[0].startAt;

      // El front manda el bearer del cliente; el teléfono/nombre tipeados son
      // datos de contacto del turno pero NO definen a qué cuenta pertenece.
      await http
        .post(`/r/${slug}/book`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          staffId,
          serviceId,
          startAt: bookedSlot,
          fullName: 'Otro Nombre',
          phone: '2612999999',
        })
        .expect(201);
    });

    it('GET /v1/me/appointments devuelve el turno del cliente logueado', async () => {
      const res = await http
        .get('/v1/me/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const found = res.body.find((a: { startAt: string }) => a.startAt === bookedSlot);
      expect(found).toBeDefined();
      expect(found.status).toBe(AppointmentStatus.Confirmed);
    });

    it('business expone phone/email de contacto del negocio cuando el pro los cargó', async () => {
      // El profesional carga su contacto público (mismo origen que la página pública).
      await http
        .patch('/v1/professionals/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ publicPageSettings: { phone: '2613334444', email: 'contacto@shop.test' } })
        .expect(200);

      const res = await http
        .get('/v1/me/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const found = res.body.find((a: { startAt: string }) => a.startAt === bookedSlot);
      expect(found.business.phone).toBe('2613334444');
      expect(found.business.email).toBe('contacto@shop.test');
    });

    it('una reserva sin sesión (invitado) sigue funcionando como antes', async () => {
      const day = DateTime.now().plus({ days: 4 }).toISODate();
      const slots = await http
        .get(`/v1/availability/slots`)
        .query({ staffId, serviceId, from: day, to: day })
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const guestSlot = slots.body[0].startAt;

      const guest = await http
        .post(`/r/${slug}/book`)
        .send({ staffId, serviceId, startAt: guestSlot, fullName: 'Invitado', phone: '2612888888' })
        .expect(201);
      expect(guest.body.status).toBe(AppointmentStatus.Confirmed);

      // El invitado no quedó atado a la cuenta del cliente logueado.
      const mine = await http
        .get('/v1/me/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      expect(mine.body.some((a: { startAt: string }) => a.startAt === guestSlot)).toBe(false);
    });
  });

  describe('Bug #2: turnos en MÚLTIPLES comercios se unen en /me/appointments', () => {
    let clientToken: string;
    let slugB: string;
    let serviceB: string;
    let slotA: string;
    let slotB: string;
    const clientEmail = `multi-${Date.now()}@test.com`;
    const password = 'secret123';

    it('prepara un segundo comercio (Profesional B) con servicio y horarios', async () => {
      slugB = `prob-${Date.now()}`;
      const reg = await http
        .post('/auth/register-professional')
        .send({
          email: `prob-${Date.now()}@test.com`,
          password,
          fullName: 'Pro B',
          businessName: 'Shop B',
          slug: slugB,
        })
        .expect(201);
      const tokenB = reg.body.accessToken;

      const staffRes = await http
        .get('/v1/professionals/staff')
        .set('Authorization', `Bearer ${tokenB}`)
        .expect(200);
      const staffB = staffRes.body[0].id;

      const svc = await http
        .post('/v1/services')
        .set('Authorization', `Bearer ${tokenB}`)
        .send({ name: 'Corte B', durationMinutes: 30, priceCents: 300000, allowNoPayment: true })
        .expect(201);
      serviceB = svc.body.id;

      for (let d = 0; d <= 6; d++) {
        await http
          .post(`/v1/availability/staff/${staffB}/schedule`)
          .set('Authorization', `Bearer ${tokenB}`)
          .send({ dayOfWeek: d, startTime: '09:00', endTime: '18:00' })
          .expect(201);
      }
    });

    it('el mismo cliente, logueado, reserva en comercio A y en comercio B', async () => {
      const reg = await http
        .post('/auth/register')
        .send({ email: clientEmail, password, fullName: 'Cliente Multi' })
        .expect(201);
      clientToken = reg.body.accessToken;

      const day = DateTime.now().plus({ days: 5 }).toISODate();

      // Slots por las páginas públicas (no dependen del tenant logueado).
      const slotsA = await http
        .get(`/r/${slug}/slots`)
        .query({ serviceId, from: day, to: day })
        .expect(200);
      slotA = slotsA.body[0].startAt;
      await http
        .post(`/r/${slug}/book`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({ serviceId, startAt: slotA, fullName: 'Cliente Multi', phone: '2612111111' })
        .expect(201);

      const slotsB = await http
        .get(`/r/${slugB}/slots`)
        .query({ serviceId: serviceB, from: day, to: day })
        .expect(200);
      slotB = slotsB.body[0].startAt;
      await http
        .post(`/r/${slugB}/book`)
        .set('Authorization', `Bearer ${clientToken}`)
        .send({
          serviceId: serviceB,
          startAt: slotB,
          fullName: 'Cliente Multi',
          phone: '2612111111',
        })
        .expect(201);
    });

    it('GET /v1/me/appointments devuelve AMBOS turnos (unión de comercios)', async () => {
      const res = await http
        .get('/v1/me/appointments')
        .set('Authorization', `Bearer ${clientToken}`)
        .expect(200);
      const starts = res.body.map((a: { startAt: string }) => a.startAt);
      expect(starts).toContain(slotA);
      expect(starts).toContain(slotB);
    });

    it('tras logout/login, ambos turnos siguen apareciendo', async () => {
      const login = await http
        .post('/auth/login')
        .send({ email: clientEmail, password })
        .expect(200);
      const token2 = login.body.accessToken;

      const res = await http
        .get('/v1/me/appointments')
        .set('Authorization', `Bearer ${token2}`)
        .expect(200);
      const starts = res.body.map((a: { startAt: string }) => a.startAt);
      expect(starts).toContain(slotA);
      expect(starts).toContain(slotB);
    });
  });
});
