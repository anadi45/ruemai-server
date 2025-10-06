import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ApiKeyValidator } from './api-key.validator';

describe('ApiKeyValidator', () => {
  let service: ApiKeyValidator;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeyValidator,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ApiKeyValidator>(ApiKeyValidator);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateApiKey', () => {
    it('should validate when API key exists in config', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
      };

      (configService.get as jest.Mock).mockReturnValue('test_api_key_value');

      const result = await service.validateApiKey(config);

      expect(result.isValid).toBe(true);
      expect(result.keyName).toBe('Test API');
      expect(result.error).toBeUndefined();
    });

    it('should reject when API key is missing from config', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
      };

      (configService.get as jest.Mock).mockReturnValue(undefined);

      const result = await service.validateApiKey(config);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('required but not provided');
    });
  });

  describe('validateMultipleApiKeys', () => {
    it('should validate multiple API keys', async () => {
      const configs = [
        {
          keyName: 'API 1',
          envVar: 'API_1_KEY',
        },
        {
          keyName: 'API 2',
          envVar: 'API_2_KEY',
        },
      ];

      (configService.get as jest.Mock)
        .mockReturnValueOnce('valid_key_1')
        .mockReturnValueOnce('valid_key_2');

      const results = await service.validateMultipleApiKeys(configs);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });
  });

  describe('utility methods', () => {
    it('should detect validation errors', () => {
      const results = [
        { isValid: true, keyName: 'API 1' },
        { isValid: false, keyName: 'API 2', error: 'Invalid key' },
      ];

      expect(service.hasValidationErrors(results)).toBe(true);
    });

    it('should get validation errors', () => {
      const results = [
        { isValid: true, keyName: 'API 1' },
        { isValid: false, keyName: 'API 2', error: 'Invalid key' },
        { isValid: false, keyName: 'API 3', error: 'Missing key' },
      ];

      const errors = service.getValidationErrors(results);
      expect(errors).toHaveLength(2);
      expect(errors).toContain('Invalid key');
      expect(errors).toContain('Missing key');
    });

    it('should get valid API keys', () => {
      const results = [
        { isValid: true, keyName: 'API 1' },
        { isValid: false, keyName: 'API 2', error: 'Invalid key' },
        { isValid: true, keyName: 'API 3' },
      ];

      const validKeys = service.getValidApiKeys(results);
      expect(validKeys).toHaveLength(2);
      expect(validKeys).toContain('API 1');
      expect(validKeys).toContain('API 3');
    });
  });
});
