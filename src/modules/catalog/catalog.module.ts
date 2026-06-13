import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Service } from './entities/service.entity';
import { CatalogService } from './catalog.service';
import { CatalogController } from './catalog.controller';
import { ComercioCatalogController } from './comercio-catalog.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Service])],
  controllers: [CatalogController, ComercioCatalogController],
  providers: [CatalogService],
  exports: [CatalogService, TypeOrmModule],
})
export class CatalogModule {}
