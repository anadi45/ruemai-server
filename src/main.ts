import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ConfigValidationService } from './config/config-validation.service';

async function bootstrap() {
  try {
    const app = await NestFactory.create(AppModule);

    // Get configuration validation service
    const configValidationService = app.get(ConfigValidationService);

    // Validate configuration before starting
    await configValidationService.validateConfiguration();

    // Global validation pipe
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    // Global exception filter
    app.useGlobalFilters(new GlobalExceptionFilter());

    // Enable CORS
    app.enableCors();

    const port = process.env.PORT || 3000;
    await app.listen(port);
  } catch (error) {
    process.exit(1);
  }
}
bootstrap();
