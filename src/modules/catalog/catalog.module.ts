import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { ServiceCombinationRule } from './entities/service-combination-rule.entity';
import { CatalogService } from './catalog.service';
import { ServiceCombinationRulesService } from './service-combination-rules.service';
import { CatalogController } from './catalog.controller';
import { ComercioCatalogController } from './comercio-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Service, ServiceCombinationRule])],
  controllers: [CatalogController, ComercioCatalogController],
  providers: [CatalogService, ServiceCombinationRulesService],
  exports: [CatalogService, ServiceCombinationRulesService, TypeOrmModule],
})
export class CatalogModule {}
