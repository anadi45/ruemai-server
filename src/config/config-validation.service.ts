import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiKeyValidator, ApiKeyConfig } from '../validators/api-key.validator';

@Injectable()
export class ConfigValidationService {
  private readonly logger = new Logger(ConfigValidationService.name);

  constructor(
    private configService: ConfigService,
    private apiKeyValidator: ApiKeyValidator,
  ) {}

  async validateConfiguration(): Promise<void> {
    this.logger.log('🔍 Validating application configuration...');

    // Validate API Keys
    await this.validateApiKeys();

    // Validate other configuration
    this.validateAppConfiguration();

    this.logger.log('✅ Configuration validation completed successfully');
  }

  private async validateApiKeys(): Promise<void> {
    const apiKeyConfigs: ApiKeyConfig[] = [
      {
        keyName: 'Gemini',
        envVar: 'GEMINI_API_KEY',
      },
    ];

    const results =
      await this.apiKeyValidator.validateMultipleApiKeys(apiKeyConfigs);

    if (this.apiKeyValidator.hasValidationErrors(results)) {
      const errors = this.apiKeyValidator.getValidationErrors(results);
      throw new Error(`API Key validation failed:\n${errors.join('\n')}`);
    }

    const validKeys = this.apiKeyValidator.getValidApiKeys(results);
    this.logger.log(`✅ Validated API keys: ${validKeys.join(', ')}`);
  }

  private validateAppConfiguration(): void {
    // Validate port
    const port = this.configService.get<number>('PORT', 3000);
    if (port < 1 || port > 65535) {
      throw new Error(
        `❌ Invalid PORT: ${port}. Port must be between 1 and 65535.`,
      );
    }

    // Validate crawl delay (rate limiting)
    const crawlDelay = this.configService.get<number>('CRAWL_DELAY', 1000);
    if (crawlDelay < 100 || crawlDelay > 10000) {
      throw new Error(
        `❌ Invalid CRAWL_DELAY: ${crawlDelay}. Must be between 100ms and 10s.`,
      );
    }

    // Validate file size limit
    const maxFileSize = this.configService.get<number>(
      'MAX_FILE_SIZE',
      10485760,
    );
    if (maxFileSize < 1024 || maxFileSize > 104857600) {
      throw new Error(
        `❌ Invalid MAX_FILE_SIZE: ${maxFileSize}. Must be between 1KB and 100MB.`,
      );
    }

    // Validate chunk size
    const chunkSize = this.configService.get<number>('CHUNK_SIZE', 4000);
    if (chunkSize < 100 || chunkSize > 10000) {
      throw new Error(
        `❌ Invalid CHUNK_SIZE: ${chunkSize}. Must be between 100 and 10000 tokens.`,
      );
    }

    this.logger.log('✅ Application configuration is valid');
  }

  getConfigurationSummary(): object {
    return {
      port: this.configService.get<number>('PORT', 3000),
      nodeEnv: this.configService.get<string>('NODE_ENV', 'development'),
      maxFileSize: this.configService.get<number>('MAX_FILE_SIZE', 10485760),
      chunkSize: this.configService.get<number>('CHUNK_SIZE', 4000),
      crawlDelay: this.configService.get<number>('CRAWL_DELAY', 1000),
      hasGeminiKey: !!this.configService.get<string>('GEMINI_API_KEY'),
    };
  }
}
