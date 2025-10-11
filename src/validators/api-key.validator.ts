import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApiKeyConfig {
  keyName: string;
  envVar: string;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  keyName: string;
}

@Injectable()
export class ApiKeyValidator {
  constructor(private configService: ConfigService) {}

  /**
   * Simple API key validation - only checks if key exists in config
   */
  async validateApiKey(config: ApiKeyConfig): Promise<ValidationResult> {
    const { keyName, envVar } = config;

    try {
      const apiKey = this.configService.get<string>(envVar);

      // Check if key exists
      if (!apiKey) {
        return {
          isValid: false,
          error: `❌ ${keyName} API key is required but not provided. Please set ${envVar} in your .env file.`,
          keyName,
        };
      }

      return {
        isValid: true,
        keyName,
      };
    } catch (error) {
      return {
        isValid: false,
        error: `❌ ${keyName} API key validation error: ${error.message}`,
        keyName,
      };
    }
  }

  /**
   * Validate multiple API keys
   */
  async validateMultipleApiKeys(
    configs: ApiKeyConfig[],
  ): Promise<ValidationResult[]> {
    const results: ValidationResult[] = [];

    for (const config of configs) {
      const result = await this.validateApiKey(config);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if any API key validation failed
   */
  hasValidationErrors(results: ValidationResult[]): boolean {
    return results.some((result) => !result.isValid);
  }

  /**
   * Get all validation errors
   */
  getValidationErrors(results: ValidationResult[]): string[] {
    return results
      .filter((result) => !result.isValid)
      .map((result) => result.error);
  }

  /**
   * Get valid API keys
   */
  getValidApiKeys(results: ValidationResult[]): string[] {
    return results
      .filter((result) => result.isValid)
      .map((result) => result.keyName);
  }
}
