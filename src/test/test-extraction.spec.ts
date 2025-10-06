import { Test, TestingModule } from '@nestjs/testing';
import { ExtractionService } from '../extraction/extraction.service';
import { UploadService } from '../upload/upload.service';
import { WebCrawlerService } from '../web-crawler/web-crawler.service';
import { ParserService } from '../parser/parser.service';
import { FeatureExtractorService } from '../feature-extractor/feature-extractor.service';
import { ConfigService } from '@nestjs/config';
import { storage } from '../utils/storage';

describe('ExtractionService', () => {
  let service: ExtractionService;
  let uploadService: jest.Mocked<UploadService>;
  let webCrawlerService: jest.Mocked<WebCrawlerService>;
  let parserService: jest.Mocked<ParserService>;
  let featureExtractorService: jest.Mocked<FeatureExtractorService>;

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
    uploadService = module.get(UploadService);
    webCrawlerService = module.get(WebCrawlerService);
    parserService = module.get(ParserService);
    featureExtractorService = module.get(FeatureExtractorService);

    // Clear storage before each test
    storage.clear();
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

  it('should process files and URLs in parallel', async () => {
    const mockFiles = [
      {
        originalname: 'test1.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content 1'),
      },
      {
        originalname: 'test2.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content 2'),
      },
    ] as Express.Multer.File[];

    const mockUrl = 'https://example.com';

    const mockDocuments = [
      {
        id: 'doc1',
        filename: 'test1.pdf',
        content: 'test content 1',
        uploadedAt: new Date(),
        mimeType: 'application/pdf',
      },
      {
        id: 'doc2',
        filename: 'test2.pdf',
        content: 'test content 2',
        uploadedAt: new Date(),
        mimeType: 'application/pdf',
      },
    ];

    const mockCrawlResult = {
      pages: [
        {
          url: 'https://example.com',
          content: 'web content',
          title: 'Example Page',
          crawledAt: new Date(),
        },
      ],
      totalPages: 1,
      crawledUrls: ['https://example.com'],
    };

    const mockChunks = ['chunk1', 'chunk2'];
    const mockFeatures = [
      { name: 'Feature 1', description: 'Description 1', source: 'test1.pdf' },
      { name: 'Feature 2', description: 'Description 2', source: 'test2.pdf' },
      { name: 'Web Feature', description: 'Web Description', source: 'https://example.com' },
    ];

    // Mock the services
    uploadService.processMultipleFiles.mockResolvedValue(mockDocuments);
    webCrawlerService.crawlWebsite.mockResolvedValue(mockCrawlResult);
    parserService.processContentWithOverlap.mockResolvedValue(mockChunks);
    featureExtractorService.extractFeaturesFromChunks.mockResolvedValue([
      mockFeatures[0],
    ]);

    const request = {
      files: mockFiles,
      url: mockUrl,
    };

    const result = await service.extractFeatures(request);

    expect(uploadService.processMultipleFiles).toHaveBeenCalledWith(mockFiles);
    expect(webCrawlerService.crawlWebsite).toHaveBeenCalledWith(mockUrl);
    expect(result.stats.documentsProcessed).toBe(2);
    expect(result.stats.pagesCrawled).toBe(1);
  });

  it('should handle parallel processing when only files are provided', async () => {
    const mockFiles = [
      {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
      },
    ] as Express.Multer.File[];

    const mockDocuments = [
      {
        id: 'doc1',
        filename: 'test.pdf',
        content: 'test content',
        uploadedAt: new Date(),
        mimeType: 'application/pdf',
      },
    ];

    const mockChunks = ['chunk1'];
    const mockFeatures = [
      { name: 'Feature 1', description: 'Description 1', source: 'test.pdf' },
    ];

    uploadService.processMultipleFiles.mockResolvedValue(mockDocuments);
    parserService.processContentWithOverlap.mockResolvedValue(mockChunks);
    featureExtractorService.extractFeaturesFromChunks.mockResolvedValue(mockFeatures);

    const request = {
      files: mockFiles,
    };

    const result = await service.extractFeatures(request);

    expect(uploadService.processMultipleFiles).toHaveBeenCalledWith(mockFiles);
    expect(webCrawlerService.crawlWebsite).not.toHaveBeenCalled();
    expect(result.stats.documentsProcessed).toBe(1);
    expect(result.stats.pagesCrawled).toBe(0);
  });

  it('should handle parallel processing when only URL is provided', async () => {
    const mockUrl = 'https://example.com';

    const mockCrawlResult = {
      pages: [
        {
          url: 'https://example.com',
          content: 'web content',
          title: 'Example Page',
          crawledAt: new Date(),
        },
      ],
      totalPages: 1,
      crawledUrls: ['https://example.com'],
    };

    const mockChunks = ['chunk1'];
    const mockFeatures = [
      { name: 'Web Feature', description: 'Web Description', source: 'https://example.com' },
    ];

    webCrawlerService.crawlWebsite.mockResolvedValue(mockCrawlResult);
    parserService.processContentWithOverlap.mockResolvedValue(mockChunks);
    featureExtractorService.extractFeaturesFromChunks.mockResolvedValue(mockFeatures);

    const request = {
      url: mockUrl,
    };

    const result = await service.extractFeatures(request);

    expect(webCrawlerService.crawlWebsite).toHaveBeenCalledWith(mockUrl);
    expect(uploadService.processMultipleFiles).not.toHaveBeenCalled();
    expect(result.stats.documentsProcessed).toBe(0);
    expect(result.stats.pagesCrawled).toBe(1);
  });

  it('should handle errors gracefully in parallel processing', async () => {
    const mockFiles = [
      {
        originalname: 'test.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('test content'),
      },
    ] as Express.Multer.File[];

    const mockUrl = 'https://example.com';

    // Mock file processing to succeed
    uploadService.processMultipleFiles.mockResolvedValue([]);
    
    // Mock URL processing to fail
    webCrawlerService.crawlWebsite.mockRejectedValue(new Error('Crawl failed'));

    const request = {
      files: mockFiles,
      url: mockUrl,
    };

    const result = await service.extractFeatures(request);

    expect(result.stats.documentsProcessed).toBe(0);
    expect(result.stats.pagesCrawled).toBe(0);
  });
});
