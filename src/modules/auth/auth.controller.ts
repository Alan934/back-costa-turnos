import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { AuthenticatedRequest } from '@/common/types/request-user';
import { VerificationPurpose } from '@/common/enums';
import { AppConfig } from '@/config/configuration';
import { AuthService, GoogleProfileInput } from './auth.service';
import {
  GoogleOAuthGuard,
  clearGoogleStateCookie,
  isValidGoogleState,
} from './guards/google-oauth.guard';
import {
  AuthMeDto,
  AuthTokensDto,
  ClaimAccountDto,
  GoogleExchangeDto,
  LoginDto,
  RefreshDto,
  RegisterComercialDto,
  RegisterDto,
  RegisterProfessionalDto,
  RequestCodeDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: VERSION_NEUTRAL })
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @ApiOperation({ summary: 'Registrar una nueva cuenta (cliente)' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @ApiOperation({
    summary: 'Registrarse como profesional',
    description: 'Crea la cuenta + el profesional con su comercio-de-uno y suscripción trial.',
  })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos o slug en uso' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register-professional')
  registerProfessional(@Body() dto: RegisterProfessionalDto) {
    return this.auth.registerProfessional(dto);
  }

  @ApiOperation({
    summary: 'Registrarse como comercial (dueño de un comercio)',
    description:
      'Crea la cuenta + el comercio que va a gestionar. NO crea profesional ni suscripción: el ' +
      'comercial gestiona profesionales/servicios y no paga (la facturación es por profesional).',
  })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @ApiResponse({ status: 409, description: 'El slug ya está en uso' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('register-comercial')
  registerComercial(@Body() dto: RegisterComercialDto) {
    return this.auth.registerComercial(dto);
  }

  @ApiOperation({ summary: 'Iniciar sesion' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiOperation({ summary: 'Renovar tokens de acceso' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @ApiOperation({ summary: 'Cerrar sesion' })
  @ApiResponse({ status: 204, description: 'Sesion cerrada' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  async logout(
    @CurrentAccount('sub') accountId: string,
    @CurrentAccount('sid') sid?: string,
  ): Promise<void> {
    await this.auth.logout(accountId, sid);
  }

  @ApiOperation({ summary: 'Obtener el usuario autenticado' })
  @ApiResponse({ status: 200, type: AuthMeDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiBearerAuth()
  @Get('me')
  me(@CurrentAccount('sub') accountId: string): Promise<AuthMeDto> {
    return this.auth.getMe(accountId);
  }

  // ---- Google OAuth ----
  @ApiOperation({ summary: 'Iniciar login con Google' })
  @ApiResponse({ status: 302, description: 'Redirige al consentimiento de Google.' })
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google')
  googleAuth(): void {
    // Redirige a Google (manejado por el guard).
  }

  @ApiOperation({ summary: 'Callback de login con Google' })
  @ApiResponse({
    status: 302,
    description:
      'Redirige al frontend con un código de un solo uso (?code=) para canjear por tokens en ' +
      'POST /auth/google/exchange. Si falla, redirige con ?error=.',
  })
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const appConfig = this.config.getOrThrow<AppConfig>('app');
    const target = new URL('/auth/callback', appConfig.frontUrl);

    // El state debe coincidir con la cookie del navegador que inició el login (anti CSRF).
    const stateOk = isValidGoogleState(req);
    clearGoogleStateCookie(res);
    const profile = req.user as unknown as GoogleProfileInput | undefined;
    if (!stateOk || !profile?.googleId) {
      target.searchParams.set('error', 'google');
      res.redirect(target.toString());
      return;
    }

    try {
      const tokens = await this.auth.validateGoogleUser(profile);
      // Los tokens NO van en la URL: solo un código opaco de un solo uso (60s).
      target.searchParams.set('code', await this.auth.createGoogleExchangeCode(tokens));
    } catch {
      target.searchParams.set('error', 'google');
    }
    res.redirect(target.toString());
  }

  @ApiOperation({ summary: 'Canjear el código del login con Google por tokens' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 401, description: 'Código inválido, usado o vencido' })
  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('google/exchange')
  googleExchange(@Body() dto: GoogleExchangeDto) {
    return this.auth.exchangeGoogleCode(dto.code);
  }

  // ---- Reclamo / verificacion / reset ----
  @ApiOperation({ summary: 'Solicitar codigo para reclamar cuenta' })
  @ApiResponse({
    status: 202,
    description: 'Respuesta { ok: true }; el codigo se envia por email.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-claim-code')
  async requestClaimCode(@Body() dto: RequestCodeDto): Promise<{ ok: true }> {
    await this.auth.requestCode(dto.email, VerificationPurpose.AccountClaim);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Reclamar una cuenta con codigo' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('claim')
  claim(@Body() dto: ClaimAccountDto) {
    return this.auth.claimAccount(dto);
  }

  @ApiOperation({ summary: 'Solicitar codigo de verificacion de email' })
  @ApiResponse({
    status: 202,
    description: 'Respuesta { ok: true }; el codigo se envia por email.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-email-code')
  async requestEmailCode(@Body() dto: RequestCodeDto): Promise<{ ok: true }> {
    await this.auth.requestCode(dto.email, VerificationPurpose.EmailVerify);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Verificar email con codigo' })
  @ApiResponse({ status: 200, description: 'Respuesta { ok: true } si el email fue verificado.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ ok: true }> {
    await this.auth.verifyEmail(dto);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Solicitar codigo de reseteo de contrasena' })
  @ApiResponse({
    status: 202,
    description: 'Respuesta { ok: true }; el codigo se envia por email.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestCodeDto): Promise<{ ok: true }> {
    await this.auth.requestCode(dto.email, VerificationPurpose.PasswordReset);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Resetear contrasena con codigo' })
  @ApiResponse({
    status: 200,
    description: 'Respuesta { ok: true } si la contrasena fue actualizada.',
  })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto);
    return { ok: true };
  }
}
