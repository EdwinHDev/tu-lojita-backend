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
    })
  );

  app.setGlobalPrefix('api/v1');

  app.enableCors({
    origin: [envs.hostOrigin],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE'
  });

  await app.listen(envs.port);
  logger.log(`Application is running on: ${envs.hostApi}`);
}
bootstrap();
