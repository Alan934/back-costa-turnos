import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MercadoPagoConfig } from '@/config/configuration';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from './entities/payment.entity';
import { Appointment } from '@/modules/appointments/entities/appointment.entity';
import { AppointmentAddon } from '@/modules/appointments/entities/appointment-addon.entity';
import { Service } from '@/modules/catalog/entities/service.entity';
import { AuditLog } from '@/modules/legal/entities/audit-log.entity';
import { ChargeService } from './charge.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MpOAuthController } from './mp-oauth.controller';
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';
import { MercadoPagoProvider } from './providers/mercadopago.provider';
import { MercadoPagoStubProvider } from './providers/mercadopago-stub.provider';
import { MercadoPagoOAuthService } from './providers/mercadopago-oauth.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Payment,
      Professional,
      Appointment,
      AppointmentAddon,
      Service,
      AuditLog,
    ]),
    JwtModule.register({}),
  ],
  controllers: [PaymentsController, MpOAuthController],
  providers: [
    PaymentsService,
    ChargeService,
    MercadoPagoOAuthService,
    MercadoPagoProvider,
    MercadoPagoStubProvider,
    {
      // Provider real si hay access token de la plataforma; si no, stub.
      provide: PAYMENT_PROVIDER,
      useFactory: (
        config: ConfigService,
        real: MercadoPagoProvider,
        stub: MercadoPagoStubProvider,
      ) => {
        const mp = config.getOrThrow<MercadoPagoConfig>('mercadopago');
        return mp.accessToken ? real : stub;
      },
      inject: [ConfigService, MercadoPagoProvider, MercadoPagoStubProvider],
    },
  ],
  exports: [PaymentsService, MercadoPagoOAuthService, PAYMENT_PROVIDER],
})
export class PaymentsModule {}
