import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { TenantGuard } from '@/common/guards/tenant.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentTenant } from '@/common/decorators/current-tenant.decorator';
import { AppRole } from '@/common/enums';
import { FilesService } from './files.service';
import { FileObject } from './entities/file.entity';

interface UploadedMulterFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname: string;
}

/**
 * Cap duro de multer (guarda de memoria, antes de bufferizar). El limite fino
 * por tipo y la validacion de tipo real (por contenido) los hace FilesService.
 * Mantener alineado con FILE_MAX_IMAGE_MB.
 */
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

@ApiTags('files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, TenantGuard)
@Roles(AppRole.Professional, AppRole.Staff)
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @ApiOperation({
    summary: 'Subir un archivo (imagen jpeg/png/webp o PDF)',
    description:
      'Imagenes hasta 10MB (se comprimen a webp); PDFs hasta 3MB. Tipos no permitidos o ' +
      'archivos que superen el tope se rechazan con 400/413.',
  })
  @ApiResponse({ status: 201, type: FileObject })
  @ApiResponse({ status: 400, description: 'Tipo no permitido o archivo invalido' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 413, description: 'El archivo supera el tamaño maximo' })
  @ApiQuery({ name: 'ownerType', required: true })
  @ApiQuery({ name: 'ownerId', required: true })
  @Post()
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } }))
  upload(
    @CurrentTenant() tenantId: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Query('ownerType') ownerType: string,
    @Query('ownerId') ownerId: string,
  ) {
    if (!file) {
      throw new BadRequestException('No se recibio ningun archivo en el campo "file"');
    }
    return this.files.upload(tenantId, ownerType, ownerId, {
      buffer: file.buffer,
      mime: file.mimetype,
      size: file.size,
    });
  }

  @ApiOperation({ summary: 'Obtener URL firmada del archivo' })
  @ApiResponse({ status: 200, description: 'Objeto con la URL firmada { url }' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @Get(':id/url')
  signedUrl(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.files.getSignedUrl(tenantId, id);
  }

  @ApiOperation({ summary: 'Eliminar un archivo' })
  @ApiResponse({ status: 204, description: 'Archivo eliminado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  @ApiResponse({ status: 403, description: 'Sin permisos' })
  @ApiResponse({ status: 404, description: 'No encontrado' })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete(':id')
  remove(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.files.remove(tenantId, id);
  }
}
