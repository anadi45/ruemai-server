import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConfigValidationService } from './config-validation.service';

describe('ConfigValidationService', () => {
  let service: ConfigValidationService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigValidationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ConfigValidationService>(ConfigValidationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should validate configuration successfully', async () => {
    // Mock valid configuration
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      const config = {
        OPENAI_API_KEY: 'test-openai-api-key-123456789012345678901234567890',
        PORT: 3000,
        MAX_CRAWL_PAGES: 50,
        MAX_FILE_SIZE: 10485760,
        CHUNK_SIZE: 4000,
        CRAWL_DELAY: 1000,
      };
      return config[key];
    });

    await expect(service.validateConfiguration()).resolves.not.toThrow();
  });

  it('should throw error for missing OpenAI API key', async () => {
    (configService.get as jest.Mock).mockReturnValue(undefined);

    await expect(service.validateConfiguration()).rejects.toThrow(
      'OPENAI_API_KEY is required but not provided',
    );
  });

  it('should throw error for invalid API key format', async () => {
    (configService.get as jest.Mock).mockReturnValue('invalid-key');

    await expect(service.validateConfiguration()).rejects.toThrow(
      'OPENAI_API_KEY appears to be invalid',
    );
  });
});
