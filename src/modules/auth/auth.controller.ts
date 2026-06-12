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
import { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { AuthenticatedRequest } from '@/common/types/request-user';
import { VerificationPurpose } from '@/common/enums';
import { AppConfig } from '@/config/configuration';
import { AuthService, GoogleProfileInput } from './auth.service';
import { GoogleOAuthGuard } from './guards/google-oauth.guard';
import {
  AuthMeDto,
  AuthTokensDto,
  ClaimAccountDto,
  LoginDto,
  RefreshDto,
  RegisterDto,
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

  @ApiOperation({ summary: 'Registrar una nueva cuenta' })
  @ApiResponse({ status: 201, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @ApiOperation({ summary: 'Iniciar sesion' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @ApiOperation({ summary: 'Renovar tokens de acceso' })
  @ApiResponse({ status: 200, type: AuthTokensDto })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
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
  async logout(@CurrentAccount('sub') accountId: string): Promise<void> {
    await this.auth.logout(accountId);
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
    description: 'Redirige al frontend con access_token y refresh_token.',
  })
  @Public()
  @UseGuards(GoogleOAuthGuard)
  @Get('google/callback')
  async googleCallback(@Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
    const profile = req.user as unknown as GoogleProfileInput;
    const tokens = await this.auth.validateGoogleUser(profile);
    const appConfig = this.config.getOrThrow<AppConfig>('app');
    // Redirige al FRONTEND (FRONT_URL) con los tokens en el query.
    const url = new URL('/auth/callback', appConfig.frontUrl);
    url.searchParams.set('access_token', tokens.accessToken);
    url.searchParams.set('refresh_token', tokens.refreshToken);
    res.redirect(url.toString());
  }

  // ---- Reclamo / verificacion / reset ----
  @ApiOperation({ summary: 'Solicitar codigo para reclamar cuenta' })
  @ApiResponse({ status: 202, description: 'Respuesta { ok: true }; el codigo se envia por email.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
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
  @Post('claim')
  claim(@Body() dto: ClaimAccountDto) {
    return this.auth.claimAccount(dto);
  }

  @ApiOperation({ summary: 'Solicitar codigo de verificacion de email' })
  @ApiResponse({ status: 202, description: 'Respuesta { ok: true }; el codigo se envia por email.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
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
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto): Promise<{ ok: true }> {
    await this.auth.verifyEmail(dto);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Solicitar codigo de reseteo de contrasena' })
  @ApiResponse({ status: 202, description: 'Respuesta { ok: true }; el codigo se envia por email.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('request-password-reset')
  async requestPasswordReset(@Body() dto: RequestCodeDto): Promise<{ ok: true }> {
    await this.auth.requestCode(dto.email, VerificationPurpose.PasswordReset);
    return { ok: true };
  }

  @ApiOperation({ summary: 'Resetear contrasena con codigo' })
  @ApiResponse({ status: 200, description: 'Respuesta { ok: true } si la contrasena fue actualizada.' })
  @ApiResponse({ status: 400, description: 'Datos invalidos' })
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto): Promise<{ ok: true }> {
    await this.auth.resetPassword(dto);
    return { ok: true };
  }
}
