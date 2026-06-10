import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FileObject } from './entities/file.entity';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { FILE_STORAGE } from './ports/file-storage.port';
import { MinioStorage } from './storage/minio.storage';

@Module({
  imports: [TypeOrmModule.forFeature([FileObject])],
  controllers: [FilesController],
  providers: [FilesService, MinioStorage, { provide: FILE_STORAGE, useExisting: MinioStorage }],
  exports: [FilesService],
})
export class FilesModule {}
