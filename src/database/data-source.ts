import 'reflect-metadata';
import { config as loadEnv } from 'dotenv';
import { DataSource, DataSourceOptions } from 'typeorm';
import { entities } from './entities';

// Carga .env para los comandos de CLI de TypeORM (migraciones).
loadEnv();

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  username: process.env.DB_USER ?? 'turnerito',
  password: process.env.DB_PASSWORD ?? 'turnerito',
  database: process.env.DB_NAME ?? 'turnerito',
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  entities,
  migrations: [__dirname + '/migrations/*.{ts,js}'],
  // Nunca synchronize: el esquema lo manejan las migraciones.
  synchronize: false,
  logging: process.env.DB_LOGGING === 'true',
};

const dataSource = new DataSource(dataSourceOptions);
export default dataSource;
