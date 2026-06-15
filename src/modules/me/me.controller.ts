import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentAccount } from '@/common/decorators/current-account.decorator';
import { MeService } from './me.service';
import { MyAppointmentDto, RescheduleMyAppointmentDto } from './dto/my-appointment.dto';

/**
 * Endpoints del cliente autenticado (cross-tenant): sus turnos en todos los
 * negocios donde reservo. No usa TenantGuard (no esta acotado a un tenant).
 */
@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @ApiOperation({ summary: 'Listar mis turnos (todos los negocios)' })
  @ApiResponse({ status: 200, type: MyAppointmentDto, isArray: true })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @Get('appointments')
  myAppointments(@CurrentAccount('sub') accountId: string): Promise<MyAppointmentDto[]> {
    return this.me.listMyAppointments(accountId);
  }

  @ApiOperation({ summary: 'Cancelar un turno propio (dentro de la ventana)' })
  @ApiResponse({ status: 200, type: MyAppointmentDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  @ApiResponse({ status: 409, description: 'Fuera de la ventana de cancelacion' })
  @HttpCode(HttpStatus.OK)
  @Post('appointments/:id/cancel')
  cancel(
    @CurrentAccount('sub') accountId: string,
    @Param('id') id: string,
  ): Promise<MyAppointmentDto> {
    return this.me.cancelMyAppointment(accountId, id);
  }

  @ApiOperation({ summary: 'Reprogramar un turno propio (dentro de la ventana)' })
  @ApiResponse({ status: 200, type: MyAppointmentDto })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 404, description: 'Turno no encontrado' })
  @ApiResponse({ status: 409, description: 'Fuera de la ventana de reprogramacion o solape' })
  @HttpCode(HttpStatus.OK)
  @Post('appointments/:id/reschedule')
  reschedule(
    @CurrentAccount('sub') accountId: string,
    @Param('id') id: string,
    @Body() dto: RescheduleMyAppointmentDto,
  ): Promise<MyAppointmentDto> {
    return this.me.rescheduleMyAppointment(accountId, id, dto);
  }
}
