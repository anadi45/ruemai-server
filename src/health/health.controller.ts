import { Controller, Get } from '@nestjs/common';
import { ConfigValidationService } from '../config/config-validation.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly configValidationService: ConfigValidationService,
  ) {}

  @Get()
  async getHealth() {
    const config = this.configValidationService.getConfigurationSummary();

    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      configuration: config,
      services: {
        gemini: (config as any).hasGeminiKey ? 'configured' : 'missing',
        storage: 'in-memory',
        parser: 'active',
        crawler: 'active',
        extractor: 'active',
      },
    };
  }

  @Get('config')
  async getConfiguration() {
    return this.configValidationService.getConfigurationSummary();
  }
}
