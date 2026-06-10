import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MercadoPagoConfig } from '@/config/configuration';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MpOAuthController } from './mp-oauth.controller';
import { PAYMENT_PROVIDER } from './ports/payment-provider.port';
import { MercadoPagoProvider } from './providers/mercadopago.provider';
import { MercadoPagoStubProvider } from './providers/mercadopago-stub.provider';
import { MercadoPagoOAuthService } from './providers/mercadopago-oauth.service';

@Module({
  imports: [TypeOrmModule.forFeature([Payment, Professional]), JwtModule.register({})],
  controllers: [PaymentsController, MpOAuthController],
  providers: [
    PaymentsService,
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
