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
    it('should validate a valid API key', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
        minLength: 10,
        prefix: 'test_',
      };

      (configService.get as jest.Mock).mockReturnValue('test_valid_key_12345');

      const result = await service.validateApiKey(config);

      expect(result.isValid).toBe(true);
      expect(result.keyName).toBe('Test API');
      expect(result.error).toBeUndefined();
    });

    it('should reject placeholder keys', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
        minLength: 10,
      };

      (configService.get as jest.Mock).mockReturnValue('your_api_key_here');

      const result = await service.validateApiKey(config);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('placeholder');
    });

    it('should reject keys that are too short', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
        minLength: 20,
      };

      (configService.get as jest.Mock).mockReturnValue('short');

      const result = await service.validateApiKey(config);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('too short');
    });

    it('should reject keys with wrong prefix', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
        minLength: 10,
        prefix: 'sk-',
      };

      (configService.get as jest.Mock).mockReturnValue('invalid_prefix_key');

      const result = await service.validateApiKey(config);

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('should start with');
    });

    it('should handle missing API key', async () => {
      const config = {
        keyName: 'Test API',
        envVar: 'TEST_API_KEY',
        minLength: 10,
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
          minLength: 10,
        },
        {
          keyName: 'API 2',
          envVar: 'API_2_KEY',
          minLength: 10,
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
