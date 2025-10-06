import { Test, TestingModule } from '@nestjs/testing';
import { ExtractionService } from '../extraction/extraction.service';
import { UploadService } from '../upload/upload.service';
import { WebCrawlerService } from '../web-crawler/web-crawler.service';
import { ParserService } from '../parser/parser.service';
import { FeatureExtractorService } from '../feature-extractor/feature-extractor.service';
import { ConfigService } from '@nestjs/config';

describe('ExtractionService', () => {
  let service: ExtractionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExtractionService,
        {
          provide: UploadService,
          useValue: {
            processMultipleFiles: jest.fn(),
          },
        },
        {
          provide: WebCrawlerService,
          useValue: {
            crawlWebsite: jest.fn(),
          },
        },
        {
          provide: ParserService,
          useValue: {
            processContentWithOverlap: jest.fn(),
          },
        },
        {
          provide: FeatureExtractorService,
          useValue: {
            extractFeaturesFromChunks: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    service = module.get<ExtractionService>(ExtractionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should extract features from documents', async () => {
    const mockFiles = [
      {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
      },
    ] as Express.Multer.File[];

    const mockFeatures = [
      {
        name: 'Test Feature',
        description: 'A test feature',
        source: 'test.pdf',
      },
    ];

    jest.spyOn(service, 'extractFromDocuments').mockResolvedValue(mockFeatures);

    const result = await service.extractFromDocuments(mockFiles);
    expect(result).toEqual(mockFeatures);
  });
});
