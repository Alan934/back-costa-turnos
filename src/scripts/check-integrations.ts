import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { Client as MinioClient } from 'minio';
import nodemailer from 'nodemailer';

/**
 * Verifica conectividad de las integraciones externas (MinIO + SMTP) usando el
 * .env real, sin levantar el server. Uso: npm run check:integrations
 *
 * Google OAuth no se testea aca (es un redirect del navegador): se prueba
 * golpeando GET /auth/google en la app corriendo.
 */
loadEnv();

async function checkMinio(): Promise<boolean> {
  const endPoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = parseInt(process.env.MINIO_PORT ?? '9000', 10);
  const bucket = process.env.MINIO_BUCKET ?? 'turnerito';
  console.log(`\n[MinIO] ${endPoint}:${port} bucket="${bucket}" ssl=${process.env.MINIO_USE_SSL}`);
  try {
    const client = new MinioClient({
      endPoint,
      port,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY ?? '',
      secretKey: process.env.MINIO_SECRET_KEY ?? '',
    });
    const exists = await client.bucketExists(bucket);
    if (!exists) {
      console.log(`  bucket no existe, creando...`);
      await client.makeBucket(bucket);
    }
    // prueba real de escritura/lectura/borrado
    const key = `__healthcheck__/${Date.now()}.txt`;
    const body = Buffer.from('ok');
    await client.putObject(bucket, key, body, body.length, { 'Content-Type': 'text/plain' });
    const url = await client.presignedGetObject(bucket, key, 60);
    await client.removeObject(bucket, key);
    console.log(`  OK: put/sign/remove funcionan. URL firmada de ejemplo:`);
    console.log(`      ${url.slice(0, 80)}...`);
    return true;
  } catch (err) {
    console.error(`  FALLO: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function checkSmtp(): Promise<boolean> {
  const host = process.env.MAIL_HOST ?? '';
  const port = parseInt(process.env.MAIL_PORT ?? '587', 10);
  const user = process.env.MAIL_USER ?? '';
  console.log(`\n[SMTP] ${host}:${port} user="${user}" secure=${port === 465}`);
  if (!host || !user) {
    console.log('  SKIP: MAIL_HOST/MAIL_USER vacios.');
    return false;
  }
  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass: process.env.MAIL_PASSWORD ?? '' },
    });
    await transporter.verify();
    console.log('  OK: handshake + autenticacion SMTP correctos.');

    const to = process.env.CHECK_MAIL_TO ?? user;
    if (process.env.CHECK_MAIL_SEND === 'true') {
      const info = await transporter.sendMail({
        from: process.env.MAIL_FROM ?? user,
        to,
        subject: 'Turnerito · prueba de correo',
        text: 'Este es un correo de prueba del backend de Turnerito. Si lo recibis, el SMTP funciona.',
      });
      console.log(`  Correo de prueba enviado a ${to} (messageId: ${info.messageId})`);
    } else {
      console.log('  (set CHECK_MAIL_SEND=true para enviar un correo de prueba real)');
    }
    return true;
  } catch (err) {
    console.error(`  FALLO: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function main(): Promise<void> {
  const minioOk = await checkMinio();
  const smtpOk = await checkSmtp();
  console.log(`\n=== Resumen ===`);
  console.log(`  MinIO: ${minioOk ? 'OK' : 'FALLO'}`);
  console.log(`  SMTP:  ${smtpOk ? 'OK' : 'FALLO'}`);
  process.exit(minioOk && smtpOk ? 0 : 1);
}

void main();
