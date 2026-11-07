import { Body, Controller, Get, HttpCode, Param, Post, VERSION_NEUTRAL } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/public.decorator';
import { AppointmentsService } from './appointments.service';
import { AwayDto, LeaveResultDto, MyWaitingSpotDto } from './dto/waiting-room.dto';
import { PushSubscriptionDto } from '@/modules/push/dto/push.dto';

/**
 * Vista personal del cliente en la fila (/sala/t/:token). Pública a propósito:
 * el cliente llega acá escaneando un QR o abriendo el link que le dimos al
 * anotarse, sin cuenta ni login. El token es opaco y aleatorio, así que no se
 * expone el id del turno en una URL que queda en el historial o se reenvía.
 */
@ApiTags('public-booking')
@Public()
// El token del link personal es la única credencial: acciones (salir, ausentarse, push) a 30/min.
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller({ path: 'sala', version: VERSION_NEUTRAL })
export class WaitingSpotController {
  constructor(private readonly appointments: AppointmentsService) {}

  @ApiOperation({ summary: 'Mi lugar en la fila (link personal con token)' })
  @ApiResponse({ status: 200, type: MyWaitingSpotDto })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @Get('t/:token')
  spot(@Param('token') token: string): Promise<MyWaitingSpotDto> {
    return this.appointments.getSpotByToken(token);
  }

  @ApiOperation({
    summary: 'Ya no voy: salir de la fila',
    description:
      'Si llegó sin turno, el turno se anula. Si tenía un turno agendado, solo sale de la fila ' +
      'y el turno se conserva (keptAppointment=true).',
  })
  @ApiResponse({ status: 201, type: LeaveResultDto })
  @ApiResponse({ status: 400, description: 'Ya lo están atendiendo / ya no está en la fila' })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @Post('t/:token/leave')
  leave(@Param('token') token: string): Promise<LeaveResultDto> {
    return this.appointments.leaveByToken(token);
  }

  @ApiOperation({
    summary: 'Me voy y vuelvo: ausentarse un rato sin perder el lugar',
    description: 'Hasta 15 minutos, máximo 2 veces por día. Mientras tanto se lo saltea.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 400, description: 'Ya lo llamaron / sin ausencias disponibles' })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @HttpCode(204)
  @Post('t/:token/away')
  async away(@Param('token') token: string, @Body() dto: AwayDto): Promise<void> {
    await this.appointments.setAwayByToken(token, dto.minutes);
  }

  @ApiOperation({ summary: 'Ya volví: termina la ausencia antes de tiempo' })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @HttpCode(204)
  @Post('t/:token/back')
  async back(@Param('token') token: string): Promise<void> {
    await this.appointments.backByToken(token);
  }

  @ApiOperation({
    summary: 'Avisarme por notificación push cuando me toque',
    description: 'Suscribe este navegador a los avisos de este turno.',
  })
  @ApiResponse({ status: 204 })
  @ApiResponse({ status: 503, description: 'El servidor no tiene Web Push configurado' })
  @HttpCode(204)
  @Post('t/:token/push')
  async subscribePush(
    @Param('token') token: string,
    @Body() dto: PushSubscriptionDto,
  ): Promise<void> {
    await this.appointments.subscribePushByToken(token, dto);
  }

  @ApiOperation({ summary: 'Dejar de recibir avisos push de este turno' })
  @ApiResponse({ status: 204 })
  @HttpCode(204)
  @Post('t/:token/push/unsubscribe')
  async unsubscribePush(@Param('token') token: string): Promise<void> {
    await this.appointments.unsubscribePushByToken(token);
  }
}
