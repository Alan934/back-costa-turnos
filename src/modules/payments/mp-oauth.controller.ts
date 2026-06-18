import { Controller, Delete, Get, Query, Res, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
import {
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { MercadoPagoConfig } from '@/config/configuration';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { MercadoPagoOAuthService } from './providers/mercadopago-oauth.service';

/**
 * Conexion de la cuenta de MercadoPago del profesional (OAuth marketplace).
 * El callback es publico (lo invoca el navegador del profesional al volver de MP)
 * y reconcilia con el tenant via el `state` firmado.
 */
@ApiTags('payments')
@Controller({ path: 'payments/mp/oauth', version: VERSION_NEUTRAL })
export class MpOAuthController {
  private readonly frontReturnUrl: string;

  constructor(
    private readonly oauth: MercadoPagoOAuthService,
    @InjectRepository(Professional)
    private readonly professionals: Repository<Professional>,
    config: ConfigService,
  ) {
    this.frontReturnUrl = config.getOrThrow<MercadoPagoConfig>('mercadopago').frontReturnUrl;
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Obtener la URL para conectar la cuenta de MercadoPago' })
  @ApiResponse({ status: 200, description: 'Objeto { url } al que redirigir al profesional' })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get('connect')
  async connect(@CurrentTenant() tenantId: string): Promise<{ url: string }> {
    return { url: await this.oauth.buildConnectUrl(tenantId) };
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Estado de conexion de MercadoPago' })
  @ApiResponse({ status: 200, description: '{ connected, mpUserId, connectedAt }' })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Get('status')
  async status(
    @CurrentTenant() tenantId: string,
  ): Promise<{ connected: boolean; mpUserId: string | null; connectedAt: Date | null }> {
    const p = await this.professionals.findOne({ where: { id: tenantId } });
    return {
      connected: Boolean(p?.mpConnectedAt),
      mpUserId: p?.mpUserId ?? null,
      connectedAt: p?.mpConnectedAt ?? null,
    };
  }

  @Public()
  @ApiExcludeEndpoint()
  @Get('callback')
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const back = (ok: boolean): string => {
      const url = new URL('/ajustes/pagos', this.frontReturnUrl);
      url.searchParams.set('mp', ok ? 'connected' : 'error');
      return url.toString();
    };
    try {
      if (!code || !state) throw new Error('faltan code/state');
      const tenantId = await this.oauth.verifyState(state);
      const conn = await this.oauth.exchangeCode(code);
      await this.professionals.update(tenantId, {
        mpUserId: conn.userId,
        mpAccessToken: conn.accessToken,
        mpRefreshToken: conn.refreshToken,
        mpPublicKey: conn.publicKey,
        mpTokenExpiresAt: conn.expiresAt,
        mpConnectedAt: new Date(),
      });
      res.redirect(back(true));
    } catch {
      res.redirect(back(false));
    }
  }

  @ApiBearerAuth()
  @ApiOperation({ summary: 'Desconectar la cuenta de MercadoPago' })
  @ApiResponse({ status: 200, description: '{ ok: true }' })
  @UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
  @Roles(AppRole.Professional)
  @Delete()
  async disconnect(@CurrentTenant() tenantId: string): Promise<{ ok: true }> {
    await this.professionals.update(tenantId, {
      mpUserId: null,
      mpAccessToken: null,
      mpRefreshToken: null,
      mpPublicKey: null,
      mpTokenExpiresAt: null,
      mpConnectedAt: null,
    });
    return { ok: true };
  }
}
