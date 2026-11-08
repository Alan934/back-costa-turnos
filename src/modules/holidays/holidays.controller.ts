import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { DateTime } from 'luxon';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { SubscriptionGuard } from '@/common/guards/subscription.guard';
import { ComercioMembershipGuard } from '@/common/guards/comercio-membership.guard';
import { CurrentMembership } from '@/common/decorators/current-comercio.decorator';
import { ComerciosService } from '@/modules/comercios/comercios.service';
import { HolidaysQueryDto, MembershipHolidayDto, SetHolidayOverrideDto } from './dto/holiday.dto';
import { HOLIDAYS_ZONE, HolidaysService } from './holidays.service';

/**
 * Feriados del profesional EN UN COMERCIO. Lista los feriados nacionales con la decisión efectiva
 * (trabaja / no trabaja) y permite fijar una excepción para un feriado puntual. El ajuste general
 * (`worksHolidays`) se edita junto con el resto de la membresía.
 */
@ApiTags('holidays')
@ApiBearerAuth()
@ApiParam({
  name: 'comercioId',
  format: 'uuid',
  description: 'Comercio donde opera el profesional',
})
@UseGuards(JwtAuthGuard, ComercioMembershipGuard, SubscriptionGuard)
@Controller('comercios/:comercioId/holidays')
export class HolidaysController {
  constructor(
    private readonly holidays: HolidaysService,
    private readonly comercios: ComerciosService,
  ) {}

  @ApiOperation({
    summary: 'Listar feriados con la decisión del profesional (trabaja / no trabaja)',
  })
  @ApiResponse({ status: 200, type: MembershipHolidayDto, isArray: true })
  @Get()
  async list(
    @CurrentMembership() membershipId: string,
    @Query() query: HolidaysQueryDto,
  ): Promise<MembershipHolidayDto[]> {
    const membership = await this.comercios.getMembershipById(membershipId);
    const from = query.from ?? `${DateTime.now().setZone(HOLIDAYS_ZONE).year}-01-01`;
    const to = query.to ?? `${from.slice(0, 4)}-12-31`;
    return this.holidays.listForMembership(membership, from, to);
  }

  @ApiOperation({
    summary: 'Definir si trabajo UN feriado puntual (pisa el ajuste general de feriados)',
  })
  @ApiResponse({ status: 204, description: 'Excepción guardada' })
  @ApiResponse({ status: 404, description: 'Esa fecha no es un feriado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Put(':date')
  setOverride(
    @CurrentMembership() membershipId: string,
    @Param('date') date: string,
    @Body() dto: SetHolidayOverrideDto,
  ) {
    return this.holidays.setOverride(membershipId, date, dto.works);
  }

  @ApiOperation({ summary: 'Quitar la excepción: ese feriado vuelve a seguir el ajuste general' })
  @ApiResponse({ status: 204, description: 'Excepción eliminada' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':date')
  clearOverride(@CurrentMembership() membershipId: string, @Param('date') date: string) {
    return this.holidays.clearOverride(membershipId, date);
  }
}
