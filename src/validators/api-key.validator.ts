import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ApiKeyConfig {
  keyName: string;
  envVar: string;
  minLength: number;
  prefix?: string;
  testEndpoint?: string;
  testMethod?: () => Promise<void>;
}

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  keyName: string;
}

@Injectable()
export class ApiKeyValidator {
  private readonly logger = new Logger(ApiKeyValidator.name);

  constructor(private configService: ConfigService) {}

  /**
   * Generic API key validation
   */
  async validateApiKey(config: ApiKeyConfig): Promise<ValidationResult> {
    const { keyName, envVar, minLength, prefix, testMethod } = config;

    try {
      this.logger.log(`🔍 Validating ${keyName} API key...`);

      const apiKey = this.configService.get<string>(envVar);

      // Check if key exists
      if (!apiKey) {
        return {
          isValid: false,
          error: `❌ ${keyName} API key is required but not provided. Please set ${envVar} in your .env file.`,
          keyName,
        };
      }

      // Check for placeholder values
      if (this.isPlaceholderKey(apiKey)) {
        return {
          isValid: false,
          error: `❌ ${keyName} API key appears to be a placeholder. Please provide a valid API key.`,
          keyName,
        };
      }

      // Check minimum length
      if (apiKey.length < minLength) {
        return {
          isValid: false,
          error: `❌ ${keyName} API key appears to be too short. Minimum length: ${minLength} characters.`,
          keyName,
        };
      }

      // Check prefix if provided
      if (prefix && !apiKey.startsWith(prefix)) {
        return {
          isValid: false,
          error: `❌ ${keyName} API key should start with '${prefix}'.`,
          keyName,
        };
      }

      // Test the API key if test method is provided
      if (testMethod) {
        try {
          await testMethod();
          this.logger.log(`✅ ${keyName} API key is valid`);
        } catch (error) {
          return {
            isValid: false,
            error: `❌ ${keyName} API key validation failed: ${error.message}`,
            keyName,
          };
        }
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

  /**
   * Check if key is a placeholder
   */
  private isPlaceholderKey(apiKey: string): boolean {
    const placeholders = [
      'your_openai_api_key_here',
      'your_google_api_key_here',
      'your_api_key_here',
      'sk-your_key_here',
      'your_key_here',
      'replace_with_your_key',
      'your_key',
      'api_key_here',
    ];

    return placeholders.includes(apiKey.toLowerCase());
  }

  /**
   * Create OpenAI API key test method
   */
  createOpenAITestMethod(apiKey: string): () => Promise<void> {
    return async () => {
      const { OpenAI } = await import('openai');
      const openai = new OpenAI({ apiKey });
      await openai.models.list();
    };
  }

  /**
   * Create Google API key test method
   */
  createGoogleTestMethod(apiKey: string): () => Promise<void> {
    return async () => {
      // Test Google API key by making a simple request
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`,
      );
      if (!response.ok) {
        throw new Error(`Google API request failed: ${response.statusText}`);
      }
    };
  }

  /**
   * Create generic HTTP test method
   */
  createHttpTestMethod(
    testUrl: string,
    headers?: Record<string, string>,
  ): () => Promise<void> {
    return async () => {
      const response = await fetch(testUrl, { headers });
      if (!response.ok) {
        throw new Error(`API request failed: ${response.statusText}`);
      }
    };
  }
}
