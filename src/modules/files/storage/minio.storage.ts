import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import { MinioConfig } from '@/config/configuration';
import { FileStorage, PutObjectInput } from '../ports/file-storage.port';

/**
 * Almacenamiento en MinIO/S3. Bucket privado; el acceso es por URL firmada.
 */
@Injectable()
export class MinioStorage implements FileStorage, OnModuleInit {
  private readonly logger = new Logger(MinioStorage.name);
  private readonly client: MinioClient;
  private readonly bucket: string;

  constructor(config: ConfigService) {
    const minio = config.getOrThrow<MinioConfig>('minio');
    this.bucket = minio.bucket;
    this.client = new MinioClient({
      endPoint: minio.endpoint,
      port: minio.port,
      useSSL: minio.useSsl,
      accessKey: minio.accessKey,
      secretKey: minio.secretKey,
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (err) {
      // No bloquea el arranque si MinIO no esta disponible aun.
      this.logger.warn(`No se pudo inicializar el bucket MinIO: ${String(err)}`);
    }
  }

  async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket).catch(() => false);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
      this.logger.log(`Bucket ${this.bucket} creado`);
    }
  }

  async put(input: PutObjectInput): Promise<void> {
    await this.client.putObject(this.bucket, input.objectKey, input.body, input.body.length, {
      'Content-Type': input.mime,
    });
  }

  getSignedUrl(objectKey: string, expirySeconds = 900): Promise<string> {
    return this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
  }

  async remove(objectKey: string): Promise<void> {
    await this.client.removeObject(this.bucket, objectKey);
  }
}
