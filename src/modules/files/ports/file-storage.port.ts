export interface PutObjectInput {
  objectKey: string;
  body: Buffer;
  mime: string;
}

/**
 * Puerto de almacenamiento de objetos (bucket privado). Implementacion: MinIO/S3.
 */
export interface FileStorage {
  ensureBucket(): Promise<void>;
  put(input: PutObjectInput): Promise<void>;
  /** URL firmada temporal para descargar el objeto. */
  getSignedUrl(objectKey: string, expirySeconds?: number): Promise<string>;
  remove(objectKey: string): Promise<void>;
}

export const FILE_STORAGE = 'FILE_STORAGE';
