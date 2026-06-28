import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
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

  async register(dto: RegisterDto): Promise<IssuedTokens> {
    const existing = await this.accounts.findByEmail(dto.email);
    if (existing && existing.isClaimed) {
      throw new BadRequestException('Ya existe una cuenta con ese email');
    }

    const passwordHash = await argon2.hash(dto.password);
    let account: Account;
    if (existing) {
      // Cuenta no reclamada: la reclama seteando password.
      existing.passwordHash = passwordHash;
      existing.isClaimed = true;
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
    const existing = await this.accounts.findByEmail(dto.email);
    if (existing && existing.isClaimed) {
      throw new BadRequestException('Ya existe una cuenta con ese email');
    }
    const passwordHash = await argon2.hash(dto.password);
    let account: Account;
    if (existing) {
      existing.passwordHash = passwordHash;
      existing.isClaimed = true;
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
  }
}
