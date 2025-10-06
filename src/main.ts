import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { ConfigValidationService } from './config/config-validation.service';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    logger.log('🚀 Starting Documentation Crawler & Feature Extractor...');

    const app = await NestFactory.create(AppModule);

    // Get configuration validation service
    const configValidationService = app.get(ConfigValidationService);

    // Validate configuration before starting
    await configValidationService.validateConfiguration();

    // Log configuration summary
    const config = configValidationService.getConfigurationSummary();
    logger.log('📋 Configuration Summary:', config);

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

    logger.log(`🎉 Server is running on http://localhost:${port}`);
    logger.log('📡 API Endpoint:');
    logger.log('  POST /extract - Combined document + website extraction');
  } catch (error) {
    logger.error('❌ Failed to start application:', error.message);
    logger.error('💡 Please check your configuration and try again.');
    process.exit(1);
  }
}
bootstrap();
