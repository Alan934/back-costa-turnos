import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { FilesConfig } from '@/config/configuration';
import { FileObject } from './entities/file.entity';
import { FILE_STORAGE, FileStorage } from './ports/file-storage.port';

export interface UploadInput {
  buffer: Buffer;
  mime: string;
  size: number;
}

const PDF_MIME = 'application/pdf';
/** Formatos raster aceptados (lo que reporta sharp.metadata().format). */
const IMAGE_FORMATS = ['jpeg', 'png', 'webp'];
/** Escalera de calidad webp si la imagen no entra en el target con la calidad base. */
const QUALITY_STEPS = [75, 65, 55, 45];

@Injectable()
export class FilesService {
  private readonly cfg: FilesConfig;

  constructor(
    @InjectRepository(FileObject)
    private readonly files: Repository<FileObject>,
    @Inject(FILE_STORAGE)
    private readonly storage: FileStorage,
    config: ConfigService,
  ) {
    this.cfg = config.getOrThrow<FilesConfig>('files');
  }

  /**
   * Sube un objeto a almacenamiento privado y guarda sus metadatos.
   * - Imagenes (jpeg/png/webp): tope de entrada configurable; se comprimen a webp.
   * - PDF: tope mas chico; se valida el header real y se sube sin recomprimir.
   */
  async upload(
    tenantId: string,
    ownerType: string,
    ownerId: string,
    input: UploadInput,
  ): Promise<FileObject> {
    // El tipo se detecta por el contenido real (magic bytes / sharp), no por el
    // Content-Type que declara el cliente (que es spoofeable / a veces generico).
    const kind = await this.detectKind(input.buffer);
    if (!kind) {
      throw new BadRequestException(
        'Tipo de archivo no permitido (solo imagenes JPEG/PNG/WebP o PDF)',
      );
    }

    let body: Buffer;
    let mime: string;

    if (kind === 'image') {
      if (input.size > this.cfg.maxImageBytes) {
        throw new BadRequestException(
          `La imagen supera el maximo de ${this.mb(this.cfg.maxImageBytes)} MB`,
        );
      }
      body = await this.compressImage(input.buffer);
      mime = 'image/webp';
    } else {
      if (input.size > this.cfg.maxPdfBytes) {
        throw new BadRequestException(
          `El PDF supera el maximo de ${this.mb(this.cfg.maxPdfBytes)} MB`,
        );
      }
      if (!this.looksLikePdf(input.buffer)) {
        throw new BadRequestException('El archivo no es un PDF valido');
      }
      body = input.buffer;
      mime = PDF_MIME;
    }

    const objectKey = `${tenantId}/${ownerType}/${randomUUID()}`;
    await this.storage.put({ objectKey, body, mime });

    const file = this.files.create({
      professionalId: tenantId,
      ownerType,
      ownerId,
      objectKey,
      mime,
      sizeBytes: String(body.length),
    });
    return this.files.save(file);
  }

  /**
   * Redimensiona (respetando orientacion EXIF) y re-codifica a webp, bajando la
   * calidad por pasos hasta entrar en el peso objetivo. Si el buffer no es una
   * imagen valida, sharp lanza y devolvemos un 400.
   */
  private async compressImage(buffer: Buffer): Promise<Buffer> {
    const pipeline = sharp(buffer)
      .rotate()
      .resize({ width: this.cfg.imageMaxWidth, withoutEnlargement: true });

    const qualities = [this.cfg.imageWebpQuality, ...QUALITY_STEPS];
    let out: Buffer | undefined;
    try {
      for (const quality of qualities) {
        out = await pipeline.clone().webp({ quality }).toBuffer();
        if (out.length <= this.cfg.imageTargetBytes) break;
      }
    } catch {
      throw new BadRequestException('La imagen no se pudo procesar (archivo invalido)');
    }
    return out as Buffer;
  }

  /** Detecta el tipo real a partir de los bytes. Devuelve null si no es soportado. */
  private async detectKind(buffer: Buffer): Promise<'image' | 'pdf' | null> {
    if (this.looksLikePdf(buffer)) return 'pdf';
    try {
      const meta = await sharp(buffer).metadata();
      if (meta.format && IMAGE_FORMATS.includes(meta.format)) return 'image';
    } catch {
      // no es una imagen que sharp pueda leer
    }
    return null;
  }

  private looksLikePdf(buffer: Buffer): boolean {
    return buffer.length >= 5 && buffer.toString('latin1', 0, 5) === '%PDF-';
  }

  private mb(bytes: number): number {
    return Math.round(bytes / (1024 * 1024));
  }

  /**
   * URLs firmadas para una lista de object_keys (sin chequeo de tenant: se usa para
   * mostrar imágenes públicas, ej. ejemplos de servicios en la página de reservas).
   * Las keys que no se puedan firmar se omiten.
   */
  async getSignedUrlsForKeys(keys: string[], expirySeconds = 900): Promise<string[]> {
    const urls = await Promise.all(
      keys.map((key) => this.storage.getSignedUrl(key, expirySeconds).catch(() => null)),
    );
    return urls.filter((u): u is string => u !== null);
  }

  async getSignedUrl(tenantId: string, id: string): Promise<{ url: string }> {
    const file = await this.files.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    const url = await this.storage.getSignedUrl(file.objectKey);
    return { url };
  }

  /**
   * Borra objetos de MinIO por su object_key y limpia sus metadatos. Best-effort:
   * si un objeto ya no existe en el storage no se aborta el resto. Se usa al quitar
   * imágenes de una entidad (ej. ejemplos de un servicio) para no dejar huérfanos.
   */
  async removeByKeys(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await Promise.all(keys.map((key) => this.storage.remove(key).catch(() => undefined)));
    await this.files.delete({ objectKey: In(keys) });
  }

  async remove(tenantId: string, id: string): Promise<void> {
    const file = await this.files.findOne({
      where: { id, professionalId: tenantId },
    });
    if (!file) throw new NotFoundException('Archivo no encontrado');
    await this.storage.remove(file.objectKey);
    await this.files.delete({ id });
  }
}
