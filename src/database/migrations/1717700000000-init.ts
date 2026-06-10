import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migracion inicial: extensiones, tipos enum, tablas, indices, FKs y RLS.
 * Escrita a mano para controlar citext + RLS (no autogenerada).
 */
export class Init1717700000000 implements MigrationInterface {
  name = 'Init1717700000000';

  // Tablas multi-tenant con columna professional_id (RLS estricta).
  private readonly tenantTables = [
    'staff',
    'professional_client',
    'ficha_field',
    'service',
    'appointment',
    'payment',
    'waitlist_entry',
    'subscription',
    'raffle',
    'file',
  ];

  // Tablas con professional_id nullable (filas globales permitidas).
  private readonly tenantNullableTables = ['notification', 'audit_log'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    // ---- Extensiones ----
    await q(`CREATE EXTENSION IF NOT EXISTS citext;`);
    await q(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);

    // ---- Tipos enum ----
    await q(`CREATE TYPE account_status AS ENUM ('active','blocked');`);
    await q(
      `CREATE TYPE verification_purpose AS ENUM ('email_verify','account_claim','password_reset','otp');`,
    );
    await q(`CREATE TYPE deposit_mode AS ENUM ('none','required','hybrid');`);
    await q(`CREATE TYPE professional_client_status AS ENUM ('active','archived');`);
    await q(
      `CREATE TYPE ficha_field_type AS ENUM ('text','number','date','select','boolean','photo');`,
    );
    await q(`CREATE TYPE schedule_rule_kind AS ENUM ('work','break');`);
    await q(`CREATE TYPE calendar_provider AS ENUM ('google');`);
    await q(
      `CREATE TYPE appointment_status AS ENUM ('requested','confirmed','in_progress','done','no_show','cancelled');`,
    );
    await q(
      `CREATE TYPE cancellation_reason AS ENUM ('client','professional','bumped','no_show');`,
    );
    await q(`CREATE TYPE created_via AS ENUM ('client_self','professional');`);
    await q(`CREATE TYPE payment_type AS ENUM ('deposit','service');`);
    await q(`CREATE TYPE payment_method AS ENUM ('cash','mercadopago');`);
    await q(`CREATE TYPE payment_status AS ENUM ('pending','paid','refunded','failed');`);
    await q(`CREATE TYPE waitlist_status AS ENUM ('waiting','notified','converted','expired');`);
    await q(
      `CREATE TYPE subscription_status AS ENUM ('trial','active','past_due','grace','blocked','cancelled');`,
    );
    await q(`CREATE TYPE subscription_payment_status AS ENUM ('paid','failed');`);
    await q(`CREATE TYPE notification_channel AS ENUM ('email','whatsapp');`);
    await q(
      `CREATE TYPE notification_type AS ENUM ('reminder','waitlist','bumped','deposit','subscription');`,
    );
    await q(`CREATE TYPE notification_status AS ENUM ('queued','sent','failed');`);
    await q(`CREATE TYPE raffle_status AS ENUM ('draft','running','finished');`);
    await q(`CREATE TYPE consent_type AS ENUM ('privacy_policy','terms','data_processing');`);

    // ---- Tablas ----
    await q(`
      CREATE TABLE account (
        id uuid PRIMARY KEY,
        email citext NOT NULL,
        password_hash text,
        google_id text,
        email_verified_at timestamptz,
        is_claimed boolean NOT NULL DEFAULT false,
        is_platform_admin boolean NOT NULL DEFAULT false,
        status account_status NOT NULL DEFAULT 'active',
        refresh_token_hash text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE UNIQUE INDEX uq_account_email ON account (email);`);
    await q(
      `CREATE UNIQUE INDEX uq_account_google_id ON account (google_id) WHERE google_id IS NOT NULL;`,
    );

    await q(`
      CREATE TABLE person (
        id uuid PRIMARY KEY,
        account_id uuid REFERENCES account(id) ON DELETE SET NULL,
        full_name text NOT NULL,
        phone text,
        email citext,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_person_email ON person (email);`);
    await q(`CREATE INDEX idx_person_phone ON person (phone);`);

    await q(`
      CREATE TABLE professional (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES account(id) ON DELETE RESTRICT,
        business_name text NOT NULL,
        slug text NOT NULL,
        timezone text NOT NULL,
        default_deposit_mode deposit_mode NOT NULL DEFAULT 'none',
        cancellation_window_hours integer NOT NULL DEFAULT 24,
        public_page_settings jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE UNIQUE INDEX uq_professional_account ON professional (account_id);`);
    await q(`CREATE UNIQUE INDEX uq_professional_slug ON professional (slug);`);

    await q(`
      CREATE TABLE staff (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        account_id uuid REFERENCES account(id) ON DELETE SET NULL,
        display_name text NOT NULL,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_staff_professional ON staff (professional_id);`);

    await q(`
      CREATE TABLE verification_token (
        id uuid PRIMARY KEY,
        account_id uuid REFERENCES account(id) ON DELETE CASCADE,
        contact text NOT NULL,
        code_hash text NOT NULL,
        purpose verification_purpose NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_verification_account ON verification_token (account_id);`);
    await q(`CREATE INDEX idx_verification_contact ON verification_token (contact);`);

    await q(`
      CREATE TABLE professional_client (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        ficha_values jsonb NOT NULL DEFAULT '{}'::jsonb,
        status professional_client_status NOT NULL DEFAULT 'active',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(
      `CREATE UNIQUE INDEX uq_professional_client ON professional_client (professional_id, person_id);`,
    );
    await q(
      `CREATE INDEX idx_professional_client_tenant ON professional_client (professional_id);`,
    );

    await q(`
      CREATE TABLE ficha_field (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        label text NOT NULL,
        type ficha_field_type NOT NULL,
        options jsonb,
        is_required boolean NOT NULL DEFAULT false,
        is_visible_to_client boolean NOT NULL DEFAULT true,
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_ficha_field_tenant ON ficha_field (professional_id);`);

    await q(`
      CREATE TABLE client_note (
        id uuid PRIMARY KEY,
        professional_client_id uuid NOT NULL REFERENCES professional_client(id) ON DELETE CASCADE,
        author_staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
        body text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_client_note_pc ON client_note (professional_client_id);`);

    await q(`
      CREATE TABLE service (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        name text NOT NULL,
        duration_minutes integer NOT NULL,
        price_cents integer NOT NULL DEFAULT 0,
        deposit_mode deposit_mode NOT NULL DEFAULT 'none',
        deposit_amount_cents integer,
        is_active boolean NOT NULL DEFAULT true,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_service_tenant ON service (professional_id);`);

    await q(`
      CREATE TABLE schedule_rule (
        id uuid PRIMARY KEY,
        staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        day_of_week smallint NOT NULL,
        start_time time NOT NULL,
        end_time time NOT NULL,
        kind schedule_rule_kind NOT NULL DEFAULT 'work',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_schedule_rule_staff ON schedule_rule (staff_id);`);

    await q(`
      CREATE TABLE time_off (
        id uuid PRIMARY KEY,
        staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        reason text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_time_off_staff ON time_off (staff_id);`);

    await q(`
      CREATE TABLE staff_calendar_integration (
        id uuid PRIMARY KEY,
        staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
        provider calendar_provider NOT NULL DEFAULT 'google',
        access_token text NOT NULL,
        refresh_token text NOT NULL,
        expires_at timestamptz,
        external_calendar_id text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(
      `CREATE INDEX idx_calendar_integration_staff ON staff_calendar_integration (staff_id);`,
    );

    await q(`
      CREATE TABLE appointment (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE RESTRICT,
        service_id uuid NOT NULL REFERENCES service(id) ON DELETE RESTRICT,
        start_at timestamptz NOT NULL,
        end_at timestamptz NOT NULL,
        status appointment_status NOT NULL DEFAULT 'requested',
        is_provisional boolean NOT NULL DEFAULT false,
        cancellation_reason cancellation_reason,
        actual_start_at timestamptz,
        created_via created_via NOT NULL DEFAULT 'client_self',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(
      `CREATE INDEX idx_appointment_tenant_start ON appointment (professional_id, start_at);`,
    );
    await q(`CREATE INDEX idx_appointment_staff_start ON appointment (staff_id, start_at);`);
    await q(`CREATE INDEX idx_appointment_status ON appointment (professional_id, status);`);

    await q(`
      CREATE TABLE payment (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        appointment_id uuid REFERENCES appointment(id) ON DELETE SET NULL,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE RESTRICT,
        type payment_type NOT NULL,
        amount_cents integer NOT NULL,
        method payment_method NOT NULL,
        status payment_status NOT NULL DEFAULT 'pending',
        mercadopago_ref text,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_payment_tenant ON payment (professional_id);`);
    await q(`CREATE INDEX idx_payment_appointment ON payment (appointment_id);`);
    await q(
      `CREATE UNIQUE INDEX uq_payment_mp_ref ON payment (mercadopago_ref) WHERE mercadopago_ref IS NOT NULL;`,
    );

    await q(`
      CREATE TABLE waitlist_entry (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        staff_id uuid REFERENCES staff(id) ON DELETE SET NULL,
        person_id uuid NOT NULL REFERENCES person(id) ON DELETE CASCADE,
        service_id uuid REFERENCES service(id) ON DELETE SET NULL,
        desired_from timestamptz NOT NULL,
        desired_to timestamptz NOT NULL,
        status waitlist_status NOT NULL DEFAULT 'waiting',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_waitlist_tenant_status ON waitlist_entry (professional_id, status);`);

    await q(`
      CREATE TABLE subscription (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        status subscription_status NOT NULL DEFAULT 'trial',
        trial_ends_at timestamptz,
        current_period_start timestamptz NOT NULL,
        current_period_end timestamptz NOT NULL,
        grace_ends_at timestamptz,
        amount_cents integer NOT NULL,
        mercadopago_preapproval_id text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE UNIQUE INDEX uq_subscription_professional ON subscription (professional_id);`);

    await q(`
      CREATE TABLE subscription_payment (
        id uuid PRIMARY KEY,
        subscription_id uuid NOT NULL REFERENCES subscription(id) ON DELETE CASCADE,
        amount_cents integer NOT NULL,
        status subscription_payment_status NOT NULL,
        period_start timestamptz NOT NULL,
        period_end timestamptz NOT NULL,
        mercadopago_ref text,
        paid_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_subscription_payment_sub ON subscription_payment (subscription_id);`);

    await q(`
      CREATE TABLE notification (
        id uuid PRIMARY KEY,
        professional_id uuid REFERENCES professional(id) ON DELETE CASCADE,
        person_id uuid REFERENCES person(id) ON DELETE CASCADE,
        channel notification_channel NOT NULL,
        type notification_type NOT NULL,
        payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        scheduled_for timestamptz NOT NULL,
        status notification_status NOT NULL DEFAULT 'queued',
        attempts integer NOT NULL DEFAULT 0,
        sent_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_notification_status_sched ON notification (status, scheduled_for);`);
    await q(`CREATE INDEX idx_notification_tenant ON notification (professional_id);`);

    await q(`
      CREATE TABLE raffle (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        name text NOT NULL,
        status raffle_status NOT NULL DEFAULT 'draft',
        winner_entry_id uuid,
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_raffle_tenant ON raffle (professional_id);`);

    await q(`
      CREATE TABLE raffle_prize (
        id uuid PRIMARY KEY,
        raffle_id uuid NOT NULL REFERENCES raffle(id) ON DELETE CASCADE,
        name text NOT NULL,
        photo_key text,
        display_order integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_raffle_prize_raffle ON raffle_prize (raffle_id);`);

    await q(`
      CREATE TABLE raffle_entry (
        id uuid PRIMARY KEY,
        raffle_id uuid NOT NULL REFERENCES raffle(id) ON DELETE CASCADE,
        person_id uuid REFERENCES person(id) ON DELETE SET NULL,
        number integer NOT NULL,
        label text,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE UNIQUE INDEX uq_raffle_entry_number ON raffle_entry (raffle_id, number);`);
    await q(`CREATE INDEX idx_raffle_entry_raffle ON raffle_entry (raffle_id);`);
    // FK diferida de raffle.winner_entry_id (necesita raffle_entry creada)
    await q(
      `ALTER TABLE raffle ADD CONSTRAINT fk_raffle_winner_entry FOREIGN KEY (winner_entry_id) REFERENCES raffle_entry(id) ON DELETE SET NULL;`,
    );

    await q(`
      CREATE TABLE consent (
        id uuid PRIMARY KEY,
        account_id uuid NOT NULL REFERENCES account(id) ON DELETE CASCADE,
        type consent_type NOT NULL,
        version text NOT NULL,
        accepted_at timestamptz NOT NULL,
        ip inet,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_consent_account ON consent (account_id);`);

    await q(`
      CREATE TABLE audit_log (
        id uuid PRIMARY KEY,
        account_id uuid,
        professional_id uuid,
        action text NOT NULL,
        entity text,
        entity_id uuid,
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        ip inet,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_audit_account ON audit_log (account_id);`);
    await q(`CREATE INDEX idx_audit_tenant ON audit_log (professional_id);`);
    await q(`CREATE INDEX idx_audit_entity ON audit_log (entity, entity_id);`);

    await q(`
      CREATE TABLE file (
        id uuid PRIMARY KEY,
        professional_id uuid NOT NULL REFERENCES professional(id) ON DELETE CASCADE,
        owner_type text NOT NULL,
        owner_id uuid NOT NULL,
        object_key text NOT NULL,
        mime text NOT NULL,
        size_bytes bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );`);
    await q(`CREATE INDEX idx_file_owner ON file (owner_type, owner_id);`);
    await q(`CREATE INDEX idx_file_tenant ON file (professional_id);`);

    // ---- RLS (defensa en profundidad) ----
    const tenantCondition = (col = 'professional_id') =>
      `current_setting('app.tenant_id', true) IS NULL ` +
      `OR current_setting('app.tenant_id', true) = '' ` +
      `OR ${col} = current_setting('app.tenant_id', true)::uuid`;

    for (const table of this.tenantTables) {
      await q(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await q(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
      await q(
        `CREATE POLICY tenant_isolation ON ${table} ` +
          `USING (${tenantCondition()}) WITH CHECK (${tenantCondition()});`,
      );
    }

    for (const table of this.tenantNullableTables) {
      const cond = `${tenantCondition()} OR professional_id IS NULL`;
      await q(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
      await q(`ALTER TABLE ${table} FORCE ROW LEVEL SECURITY;`);
      await q(`CREATE POLICY tenant_isolation ON ${table} USING (${cond}) WITH CHECK (${cond});`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const q = (sql: string) => queryRunner.query(sql);

    for (const table of [...this.tenantTables, ...this.tenantNullableTables]) {
      await q(`DROP POLICY IF EXISTS tenant_isolation ON ${table};`);
      await q(`ALTER TABLE ${table} DISABLE ROW LEVEL SECURITY;`);
    }

    await q(`ALTER TABLE raffle DROP CONSTRAINT IF EXISTS fk_raffle_winner_entry;`);

    const tables = [
      'file',
      'audit_log',
      'consent',
      'raffle_entry',
      'raffle_prize',
      'raffle',
      'notification',
      'subscription_payment',
      'subscription',
      'waitlist_entry',
      'payment',
      'appointment',
      'staff_calendar_integration',
      'time_off',
      'schedule_rule',
      'service',
      'client_note',
      'ficha_field',
      'professional_client',
      'verification_token',
      'staff',
      'professional',
      'person',
      'account',
    ];
    for (const t of tables) {
      await q(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }

    const enums = [
      'consent_type',
      'raffle_status',
      'notification_status',
      'notification_type',
      'notification_channel',
      'subscription_payment_status',
      'subscription_status',
      'waitlist_status',
      'payment_status',
      'payment_method',
      'payment_type',
      'created_via',
      'cancellation_reason',
      'appointment_status',
      'calendar_provider',
      'schedule_rule_kind',
      'ficha_field_type',
      'professional_client_status',
      'deposit_mode',
      'verification_purpose',
      'account_status',
    ];
    for (const e of enums) {
      await q(`DROP TYPE IF EXISTS ${e};`);
    }
  }
}
