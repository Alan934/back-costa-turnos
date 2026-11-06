import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '@/redis/redis.module';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { AccountsService } from '@/modules/identity/accounts.service';
import { PersonsService } from '@/modules/identity/persons.service';
import { Account } from '@/modules/identity/entities/account.entity';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { ProfessionalsService } from '@/modules/professionals/professionals.service';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { AccountStatus, AppRole, VerificationPurpose } from '@/common/enums';
import { JwtPayload } from '@/common/types/request-user';
import { MailerService } from '@/modules/mailer/mailer.service';
import { TokensService, IssuedTokens } from './tokens.service';
import { VerificationTokenService } from './verification-token.service';
import {
  AuthMeDto,
  ClaimAccountDto,
  LoginDto,
  RegisterComercialDto,
  RegisterDto,
  RegisterProfessionalDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

const GOOGLE_CODE_PREFIX = 'auth:google:code:';

export interface GoogleProfileInput {
  googleId: string;
  email: string;
  fullName: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly accounts: AccountsService,
    private readonly persons: PersonsService,
    private readonly tokens: TokensService,
    private readonly verification: VerificationTokenService,
    private readonly mailer: MailerService,
    private readonly professionalsService: ProfessionalsService,
    private readonly comercios: ComerciosService,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    @InjectRepository(Staff)
    private readonly staff: Repository<Staff>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
  ) {}

  /** Arma el payload del JWT resolviendo roles y tenant del account. */
  async buildPayload(account: Account): Promise<JwtPayload> {
    const roles: AppRole[] = [AppRole.Client];
    let professionalId: string | undefined;
    let staffId: string | undefined;

    if (account.isPlatformAdmin) roles.push(AppRole.PlatformAdmin);

    const professional = await this.professionals.findOne({
      where: { accountId: account.id },
    });
    if (professional) {
      roles.push(AppRole.Professional);
      professionalId = professional.id;
    }

    const staffMember = await this.staff.findOne({ where: { accountId: account.id } });
    if (staffMember) {
      roles.push(AppRole.Staff);
      staffId = staffMember.id;
      professionalId ??= staffMember.professionalId;
    }

    // comercioIds = todos los comercios donde el account puede operar:
    //  - los que administra como comercial (owned), y
    //  - donde trabaja como profesional (membresías activas, incl. comercio-de-uno).
    // El rol comercial solo lo otorga ADMINISTRAR un comercio NO personal.
    const ownedComercios = await this.comercios.getOwnedComercios(account.id);
    if (ownedComercios.some((c) => !c.isPersonal)) {
      roles.push(AppRole.Comercial);
    }
    const membershipComercioIds = professionalId
      ? await this.comercios.listMembershipComercioIds(professionalId)
      : [];
    const comercioIds = [
      ...new Set([...ownedComercios.map((c) => c.id), ...membershipComercioIds]),
    ];

    return {
      sub: account.id,
      email: account.email,
      emailVerified: account.emailVerifiedAt != null,
      roles,
      isPlatformAdmin: account.isPlatformAdmin,
      professionalId,
      staffId,
      comercioIds,
    };
  }

  /** Datos frescos del usuario autenticado (para GET /auth/me): recarga la cuenta
   *  para reflejar emailVerified al instante (no el valor del token, que puede ser viejo). */
  async getMe(accountId: string): Promise<AuthMeDto> {
    const account = await this.accounts.findById(accountId);
    if (!account) throw new UnauthorizedException('Cuenta no encontrada');
    const payload = await this.buildPayload(account);
    // personId: identidad de cliente de la cuenta (no se firma en el token; solo
    // lo expone /auth/me). Permite al front filtrar de forma fiable al dueño de su
    // propia cartera sin depender del email.
    const person = await this.persons.findByAccountId(accountId);
    return { ...payload, personId: person?.id };
  }

  private async issueAndPersist(account: Account): Promise<IssuedTokens> {
    const payload = await this.buildPayload(account);
    const tokens = await this.tokens.issueTokens(payload);
    const refreshHash = await argon2.hash(tokens.refreshToken);
    await this.accounts.setRefreshTokenHash(account.id, refreshHash);
    return tokens;
  }

  private assertActive(account: Account): void {
    if (account.status === AccountStatus.Blocked) {
      throw new ForbiddenException('Cuenta bloqueada');
    }
  }

  /**
   * Antes de registrar sobre un email que YA tiene cuenta:
   *  - reclamada (tiene dueño/password): se rechaza.
   *  - no reclamada (la creó un tercero, p. ej. un profesional al cargar un cliente): solo
   *    se puede tomar probando que se controla el email, con el código que se manda por mail.
   *    Sin esta prueba, cualquiera podía registrarse con el email de otra persona y quedarse
   *    con su cuenta (y su historial de turnos) antes de que la reclame.
   * Devuelve la cuenta existente (si había) para reutilizarla.
   */
  private async assertCanRegisterOver(
    email: string,
    verificationCode?: string,
  ): Promise<Account | null> {
    const existing = await this.accounts.findByEmail(email);
    if (!existing) return null;
    if (existing.isClaimed) {
      throw new BadRequestException('Ya existe una cuenta con ese email');
    }
    if (!verificationCode) {
      // Manda el código (con cooldown) y avisa al front que lo pida.
      await this.requestCode(email, VerificationPurpose.AccountClaim);
      throw new ConflictException({
        message:
          'Ese email ya tiene una cuenta pendiente de activar. Te enviamos un código para confirmar que es tuyo.',
        error: 'claim_required',
      });
    }
    const token = await this.verification.consume(
      email,
      VerificationPurpose.AccountClaim,
      verificationCode,
    );
    if (!token) throw new BadRequestException('Codigo invalido o vencido');
    return existing;
  }

  async register(dto: RegisterDto): Promise<IssuedTokens> {
    const existing = await this.assertCanRegisterOver(dto.email, dto.verificationCode);

    const passwordHash = await argon2.hash(dto.password);
    let account: Account;
    if (existing) {
      // Cuenta no reclamada: la reclama seteando password.
      existing.passwordHash = passwordHash;
      existing.isClaimed = true;
      existing.emailVerifiedAt ??= new Date(); // probó el código enviado a ese email
      account = await this.accounts.save(existing);
    } else {
      account = await this.accounts.create({
        email: dto.email,
        passwordHash,
        isClaimed: true,
      });
    }

    await this.persons.findOrCreate({
      fullName: dto.fullName,
      email: dto.email,
      accountId: account.id,
    });

    return this.issueAndPersist(account);
  }

  /**
   * Registro de PROFESIONAL (trabajador): crea la cuenta + persona y onboardea
   * (professional + comercio-de-uno + membresía + suscripción trial).
   * El token resultante ya trae rol professional y su comercio personal.
   */
  async registerProfessional(dto: RegisterProfessionalDto): Promise<IssuedTokens> {
    const existing = await this.assertCanRegisterOver(dto.email, dto.verificationCode);
    const passwordHash = await argon2.hash(dto.password);
    let account: Account;
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.isClaimed = true;
      existing.emailVerifiedAt ??= new Date(); // probó el código enviado a ese email
      account = await this.accounts.save(existing);
    } else {
      account = await this.accounts.create({
        email: dto.email,
        passwordHash,
        isClaimed: true,
      });
    }

    await this.persons.findOrCreate({
      fullName: dto.fullName,
      email: dto.email,
      accountId: account.id,
    });

    await this.professionalsService.onboard(account.id, {
      businessName: dto.businessName,
      slug: dto.slug,
      timezone: dto.timezone,
      address: dto.address,
    });

    return this.issueAndPersist(account);
  }

  /**
   * Auto-registro de COMERCIAL: crea la cuenta + su comercio (no personal). NO crea
   * profesional ni suscripción (la facturación es por profesional). El token trae el
   * rol `comercial` y el `comercioIds` del comercio recién creado.
   */
  async registerComercial(dto: RegisterComercialDto): Promise<IssuedTokens> {
    await this.assertCanRegisterOver(dto.email, dto.verificationCode);
    const comercio = await this.comercios.createComercialWithComercio(dto);
    const account = await this.accounts.findById(comercio.accountId!);
    if (!account) throw new BadRequestException('No se pudo crear la cuenta del comercial');
    return this.issueAndPersist(account);
  }

  async login(dto: LoginDto): Promise<IssuedTokens> {
    const account = await this.accounts.findByEmail(dto.email);
    if (!account || !account.passwordHash) {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    this.assertActive(account);

    const ok = await argon2.verify(account.passwordHash, dto.password);
    if (!ok) throw new UnauthorizedException('Credenciales invalidas');

    return this.issueAndPersist(account);
  }

  async refresh(refreshToken: string): Promise<IssuedTokens> {
    let sub: string;
    try {
      ({ sub } = await this.tokens.verifyRefresh(refreshToken));
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }

    const account = await this.accounts.findById(sub);
    if (!account || !account.refreshTokenHash) {
      throw new UnauthorizedException('Sesion no encontrada');
    }
    this.assertActive(account);

    const matches = await argon2.verify(account.refreshTokenHash, refreshToken);
    if (!matches) throw new UnauthorizedException('Refresh token revocado');

    return this.issueAndPersist(account);
  }

  async logout(accountId: string): Promise<void> {
    await this.accounts.setRefreshTokenHash(accountId, null);
  }

  /** Login/registro con Google: crea o vincula account por googleId/email. */
  async validateGoogleUser(profile: GoogleProfileInput): Promise<IssuedTokens> {
    let account = await this.accounts.findByGoogleId(profile.googleId);
    if (!account) {
      account = await this.accounts.findByEmail(profile.email);
      if (account) {
        // Si la cuenta tenía password pero NUNCA se verificó el email, quien la creó pudo no
        // ser el dueño del mail (pre-registro malicioso). Google sí verifica el email, así que
        // se lo vincula pero se descartan la password y las sesiones previas.
        if (!account.emailVerifiedAt && account.passwordHash) {
          account.passwordHash = null;
          account.refreshTokenHash = null;
        }
        account.googleId = profile.googleId;
        account.isClaimed = true;
        account.emailVerifiedAt ??= new Date();
        account = await this.accounts.save(account);
      } else {
        account = await this.accounts.create({
          email: profile.email,
          googleId: profile.googleId,
          isClaimed: true,
          emailVerifiedAt: new Date(),
        });
        await this.persons.findOrCreate({
          fullName: profile.fullName,
          email: profile.email,
          accountId: account.id,
        });
      }
    }
    this.assertActive(account);
    return this.issueAndPersist(account);
  }

  /**
   * Los tokens del login con Google NO viajan en la URL de redirección (quedarían en
   * historial, logs y Referer). En su lugar se guardan en Redis bajo un código opaco de un
   * solo uso y vida corta, que el front canjea por POST /auth/google/exchange.
   */
  async createGoogleExchangeCode(tokens: IssuedTokens): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    await this.redis.set(`${GOOGLE_CODE_PREFIX}${code}`, JSON.stringify(tokens), 'EX', 60);
    return code;
  }

  /** Canjea (y borra, atómico) el código de un solo uso por los tokens. */
  async exchangeGoogleCode(code: string): Promise<IssuedTokens> {
    const raw = await this.redis.getdel(`${GOOGLE_CODE_PREFIX}${code}`);
    if (!raw) throw new UnauthorizedException('Codigo invalido o vencido');
    return JSON.parse(raw) as IssuedTokens;
  }

  /** Reclamo de cuenta no reclamada: verifica codigo y setea password. */
  async claimAccount(dto: ClaimAccountDto): Promise<IssuedTokens> {
    const token = await this.verification.consume(
      dto.email,
      VerificationPurpose.AccountClaim,
      dto.code,
    );
    if (!token) throw new BadRequestException('Codigo invalido o vencido');

    const account = await this.accounts.findByEmail(dto.email);
    if (!account) throw new BadRequestException('Cuenta no encontrada');

    const passwordHash = await argon2.hash(dto.password);
    account.passwordHash = passwordHash;
    account.isClaimed = true;
    account.emailVerifiedAt ??= new Date();
    await this.accounts.save(account);

    return this.issueAndPersist(account);
  }

  /** Genera un codigo de verificacion/reclamo y lo envia por email. */
  async requestCode(email: string, purpose: VerificationPurpose): Promise<void> {
    // Cooldown por contacto: no se reenvía antes de 60s (anti bombardeo de emails). La
    // respuesta del endpoint es la misma, así que no se filtra si el email existe.
    if (!(await this.verification.canIssue(email, purpose))) return;
    const account = await this.accounts.findByEmail(email);
    const { code } = await this.verification.issue({
      contact: email,
      purpose,
      accountId: account?.id ?? null,
    });
    await this.mailer.sendVerificationCode(email, purpose, code);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const token = await this.verification.consume(
      dto.email,
      VerificationPurpose.EmailVerify,
      dto.code,
    );
    if (!token) throw new BadRequestException('Codigo invalido o vencido');
    const account = await this.accounts.findByEmail(dto.email);
    if (account) await this.accounts.markEmailVerified(account.id);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const token = await this.verification.consume(
      dto.email,
      VerificationPurpose.PasswordReset,
      dto.code,
    );
    if (!token) throw new BadRequestException('Codigo invalido o vencido');
    const account = await this.accounts.findByEmail(dto.email);
    if (!account) throw new BadRequestException('Cuenta no encontrada');
    const passwordHash = await argon2.hash(dto.newPassword);
    await this.accounts.setPassword(account.id, passwordHash);
    await this.accounts.setRefreshTokenHash(account.id, null);
    // Recibió y usó el código en su casilla: el email queda verificado.
    if (!account.emailVerifiedAt) await this.accounts.markEmailVerified(account.id);
  }
}
