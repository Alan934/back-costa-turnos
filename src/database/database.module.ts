import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DbConfig } from '@/config/configuration';
import { entities } from './entities';

@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const db = config.getOrThrow<DbConfig>('db');
        return {
          type: 'postgres',
          host: db.host,
          port: db.port,
          username: db.user,
          password: db.password,
          database: db.name,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          entities,
          // El esquema lo manejan las migraciones (npm run migration:run).
          synchronize: false,
          migrationsRun: false,
          logging: db.logging,
        };
      },
    }),
  ],
})
export class DatabaseModule {}
