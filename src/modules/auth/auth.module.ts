import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { Staff } from '@/modules/professionals/entities/staff.entity';
import { VerificationToken } from './entities/verification-token.entity';
import { AuthService } from './auth.service';
import { TokensService } from './tokens.service';
import { VerificationTokenService } from './verification-token.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { AuthController } from './auth.controller';

@Module({
  imports: [
    IdentityModule,
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([VerificationToken, Professional, Staff]),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokensService, VerificationTokenService, JwtStrategy, GoogleStrategy],
  exports: [AuthService, VerificationTokenService],
})
export class AuthModule {}
