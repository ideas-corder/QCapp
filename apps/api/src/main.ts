import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
  });
  app.enableCors({
    origin: true,
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: false,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const swagger = new DocumentBuilder()
    .setTitle('QC Inspector API')
    .setDescription('Enterprise Quality Assurance & Inspection Platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.API_PORT || 3000);
  await app.listen(port, '0.0.0.0');
  Logger.log(`QC Inspector API listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`Swagger UI at        http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal during bootstrap:', err);
  process.exit(1);
});
