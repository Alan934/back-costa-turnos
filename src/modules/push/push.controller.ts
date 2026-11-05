import { Body, Controller, Get, HttpCode, Post, UseGuards, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { PushService } from './push.service';
import { PushPublicKeyDto, PushSubscriptionDto, PushUnsubscribeDto } from './dto/push.dto';

@ApiTags('push')
@Controller({ path: 'push', version: VERSION_NEUTRAL })
export class PushController {
  constructor(private readonly push: PushService) {}

  @ApiOperation({ summary: 'Clave pública VAPID para suscribirse a Web Push' })
  @ApiResponse({ status: 200, type: PushPublicKeyDto })
  @Public()
  @Get('public-key')
  publicKey(): PushPublicKeyDto {
    return { enabled: this.push.enabled, publicKey: this.push.publicKey };
  }

  @ApiOperation({
    summary: 'Suscribir este navegador a los avisos de mi cuenta (profesional)',
    description:
      'El cliente de la sala NO usa esto: se suscribe con el token de su link personal ' +
      '(POST /sala/t/{token}/push).',
  })
  @ApiResponse({ status: 204 })
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Post('subscribe')
  async subscribe(
    @CurrentAccount('sub') accountId: string,
    @Body() dto: PushSubscriptionDto,
  ): Promise<void> {
    await this.push.subscribeAccount(accountId, dto);
  }

  @ApiOperation({ summary: 'Quitar la suscripción de este navegador' })
  @ApiResponse({ status: 204 })
  @Public()
  @HttpCode(204)
  @Post('unsubscribe')
  async unsubscribe(@Body() dto: PushUnsubscribeDto): Promise<void> {
    await this.push.unsubscribe(dto.endpoint);
  }
}
