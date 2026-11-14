import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Public } from '@/common/decorators/public.decorator';
import { MeService } from './me.service';
import { MyAppointmentDto, RescheduleMyAppointmentDto } from './dto/my-appointment.dto';

/**
 * "Gestionar mi turno" por link personal (/turno/:token). Público a propósito: el cliente
 * llega desde el email de confirmación, sin cuenta ni login. El token es opaco y aleatorio
 * (192 bits) y es la única credencial; aplica las mismas ventanas de cancelación y
 * reprogramación que "Mis turnos".
 */
@ApiTags('public-booking')
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller({ path: 'turno', version: VERSION_NEUTRAL })
export class ManageAppointmentController {
  constructor(private readonly me: MeService) {}

  @ApiOperation({ summary: 'Ver un turno por su link personal' })
  @ApiResponse({ status: 200, type: MyAppointmentDto })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @Get(':token')
  get(@Param('token') token: string): Promise<MyAppointmentDto> {
    return this.me.getByManageToken(token);
  }

  @ApiOperation({ summary: 'Cancelar un turno por su link personal (dentro de la ventana)' })
  @ApiResponse({ status: 200, type: MyAppointmentDto })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @ApiResponse({ status: 409, description: 'Fuera de la ventana de cancelacion' })
  @HttpCode(HttpStatus.OK)
  @Post(':token/cancel')
  cancel(@Param('token') token: string): Promise<MyAppointmentDto> {
    return this.me.cancelByManageToken(token);
  }

  @ApiOperation({ summary: 'Reprogramar un turno por su link personal (dentro de la ventana)' })
  @ApiResponse({ status: 200, type: MyAppointmentDto })
  @ApiResponse({ status: 404, description: 'Token inválido' })
  @ApiResponse({ status: 409, description: 'Fuera de la ventana de reprogramacion o solape' })
  @HttpCode(HttpStatus.OK)
  @Post(':token/reschedule')
  reschedule(
    @Param('token') token: string,
    @Body() dto: RescheduleMyAppointmentDto,
  ): Promise<MyAppointmentDto> {
    return this.me.rescheduleByManageToken(token, dto);
  }
}
