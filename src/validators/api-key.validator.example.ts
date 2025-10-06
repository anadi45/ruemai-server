import { ApiKeyValidator, ApiKeyConfig } from './api-key.validator';
import { ConfigService } from '@nestjs/config';

/**
 * Example usage of the generic API key validator
 */
export class ApiKeyValidatorExample {
  constructor(
    private apiKeyValidator: ApiKeyValidator,
    private configService: ConfigService,
  ) {}

  /**
   * Example: Validate OpenAI API key
   */
  async validateOpenAIKey() {
    const config: ApiKeyConfig = {
      keyName: 'OpenAI',
      envVar: 'OPENAI_API_KEY',
      minLength: 20,
      prefix: 'sk-',
      testMethod: this.apiKeyValidator.createOpenAITestMethod(
        this.configService.get<string>('OPENAI_API_KEY'),
      ),
    };

    return await this.apiKeyValidator.validateApiKey(config);
  }

  /**
   * Example: Validate Google API key
   */
  async validateGoogleKey() {
    const config: ApiKeyConfig = {
      keyName: 'Google',
      envVar: 'GOOGLE_API_KEY',
      minLength: 20,
      testMethod: this.apiKeyValidator.createGoogleTestMethod(
        this.configService.get<string>('GOOGLE_API_KEY'),
      ),
    };

    return await this.apiKeyValidator.validateApiKey(config);
  }

  /**
   * Example: Validate custom API key with HTTP test
   */
  async validateCustomApiKey() {
    const config: ApiKeyConfig = {
      keyName: 'Custom API',
      envVar: 'CUSTOM_API_KEY',
      minLength: 32,
      prefix: 'custom_',
      testMethod: this.apiKeyValidator.createHttpTestMethod(
        'https://api.example.com/health',
        {
          Authorization: `Bearer ${this.configService.get<string>('CUSTOM_API_KEY')}`,
        },
      ),
    };

    return await this.apiKeyValidator.validateApiKey(config);
  }

  /**
   * Example: Validate multiple API keys at once
   */
  async validateAllApiKeys() {
    const configs: ApiKeyConfig[] = [
      {
        keyName: 'OpenAI',
        envVar: 'OPENAI_API_KEY',
        minLength: 20,
        prefix: 'sk-',
        testMethod: this.apiKeyValidator.createOpenAITestMethod(
          this.configService.get<string>('OPENAI_API_KEY'),
        ),
      },
      {
        keyName: 'Google',
        envVar: 'GOOGLE_API_KEY',
        minLength: 20,
        testMethod: this.apiKeyValidator.createGoogleTestMethod(
          this.configService.get<string>('GOOGLE_API_KEY'),
        ),
      },
      {
        keyName: 'Anthropic',
        envVar: 'ANTHROPIC_API_KEY',
        minLength: 20,
        prefix: 'sk-ant-',
        testMethod: this.apiKeyValidator.createHttpTestMethod(
          'https://api.anthropic.com/v1/messages',
          {
            'x-api-key': this.configService.get<string>('ANTHROPIC_API_KEY'),
            'Content-Type': 'application/json',
          },
        ),
      },
    ];

    const results = await this.apiKeyValidator.validateMultipleApiKeys(configs);

    // Check if any validation failed
    if (this.apiKeyValidator.hasValidationErrors(results)) {
      const errors = this.apiKeyValidator.getValidationErrors(results);
      console.error('API Key validation failed:', errors);
      return false;
    }

    // Get valid API keys
    const validKeys = this.apiKeyValidator.getValidApiKeys(results);
    console.log('Valid API keys:', validKeys);
    return true;
  }

  /**
   * Example: Conditional API key validation
   */
  async validateRequiredApiKeys() {
    const requiredKeys = ['OPENAI_API_KEY'];
    const optionalKeys = ['GOOGLE_API_KEY', 'ANTHROPIC_API_KEY'];

    const configs: ApiKeyConfig[] = [];

    // Add required keys
    for (const key of requiredKeys) {
      configs.push({
        keyName: key.replace('_API_KEY', ''),
        envVar: key,
        minLength: 20,
        testMethod: this.getTestMethodForKey(key),
      });
    }

    // Add optional keys only if they exist
    for (const key of optionalKeys) {
      if (this.configService.get<string>(key)) {
        configs.push({
          keyName: key.replace('_API_KEY', ''),
          envVar: key,
          minLength: 20,
          testMethod: this.getTestMethodForKey(key),
        });
      }
    }

    return await this.apiKeyValidator.validateMultipleApiKeys(configs);
  }

  private getTestMethodForKey(key: string) {
    const apiKey = this.configService.get<string>(key);

    switch (key) {
      case 'OPENAI_API_KEY':
        return this.apiKeyValidator.createOpenAITestMethod(apiKey);
      case 'GOOGLE_API_KEY':
        return this.apiKeyValidator.createGoogleTestMethod(apiKey);
      case 'ANTHROPIC_API_KEY':
        return this.apiKeyValidator.createHttpTestMethod(
          'https://api.anthropic.com/v1/messages',
          { 'x-api-key': apiKey },
        );
      default:
        return undefined;
    }
  }
}
