import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { envs } from './config/envs';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [
      // Desarrollo
      envs.frontendVendorUrlDev,
      envs.frontendAdminUrlDev,
      envs.frontendCustomerUrlDev,
      // Producción
      envs.frontendVendorUrlProd,
      envs.frontendAdminUrlProd,
      envs.frontendCustomerUrlProd,
      'https://www.tulojita.com', // Alias adicional
      envs.hostOrigin, // Configuración adicional desde env
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  await app.listen(envs.port);
  logger.log(`Application is running on: ${envs.hostApi}`);
}
bootstrap();
