import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdentityModule } from '@/modules/identity/identity.module';
import { MailerModule } from '@/modules/mailer/mailer.module';
import { Professional } from '@/modules/professionals/entities/professional.entity';
import { ServiceMembership } from '@/modules/catalog/entities/service-membership.entity';
import { ComercioMembershipGuard } from '@/common/guards/comercio-membership.guard';
import { ComercioOwnerGuard } from '@/common/guards/comercio-owner.guard';
import { ComercioAccessGuard } from '@/common/guards/comercio-access.guard';
import { Comercio } from './entities/comercio.entity';
import { Membership } from './entities/membership.entity';
import { ComercioInvitation } from './entities/comercio-invitation.entity';
import { ComerciosService } from './comercios.service';
import { InvitationsService } from './invitations.service';
import { ComerciosController } from './comercios.controller';

/**
 * @Global para que ComerciosService y los guards de contexto (membership/owner)
 * se resuelvan en cualquier módulo que los use con @UseGuards.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Comercio,
      Membership,
      ComercioInvitation,
      Professional,
      ServiceMembership,
    ]),
    IdentityModule,
    MailerModule,
  ],
  controllers: [ComerciosController],
  providers: [
    ComerciosService,
    InvitationsService,
    ComercioMembershipGuard,
    ComercioOwnerGuard,
    ComercioAccessGuard,
  ],
  exports: [
    ComerciosService,
    InvitationsService,
    ComercioMembershipGuard,
    ComercioOwnerGuard,
    ComercioAccessGuard,
    TypeOrmModule,
  ],
})
export class ComerciosModule {}
