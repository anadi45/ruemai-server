import { IsString, IsUrl, IsOptional, IsObject, IsNumber, IsBoolean, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TourStepDto {
  @IsNumber()
  order: number;

  @IsString()
  selector: string;

  @IsString()
  description: string;

  @IsString()
  tooltip: string;

  @IsOptional()
  @IsObject()
  position?: {
    x: number;
    y: number;
  };

  @IsOptional()
  @IsString()
  screenshot?: string;

  @IsNumber()
  timestamp: number;

  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class TourConfigDto {
  @IsString()
  goal: string;

  @IsString()
  featureName: string;

  @IsNumber()
  maxSteps: number;

  @IsNumber()
  timeout: number;

  @IsBoolean()
  includeScreenshots: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetSelectors?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludeSelectors?: string[];
}

export class ProductDocsDto {
  @IsString()
  featureName: string;

  @IsString()
  description: string;

  @IsArray()
  @IsString({ each: true })
  steps: string[];

  @IsObject()
  selectors: Record<string, string>;

  @IsArray()
  @IsString({ each: true })
  expectedOutcomes: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  prerequisites?: string[];
}

export class CreateDemoRequestDto {
  @IsUrl()
  websiteUrl: string;

  @IsObject()
  credentials: {
    username: string;
    password: string;
  };

  @ValidateNested()
  @Type(() => ProductDocsDto)
  featureDocs: ProductDocsDto;
}

export class CreateDemoWithFileRequestDto {
  @IsUrl()
  websiteUrl: string;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  featureName?: string;
}

export class CreateDemoResponseDto {
  @IsString()
  demoId: string;

  @IsString()
  demoName: string;

  @IsUrl()
  websiteUrl: string;

  @IsString()
  loginStatus: string;

  @IsOptional()
  @IsObject()
  pageInfo?: {
    title: string;
    url: string;
    bodyText: string;
    totalElements: number;
    buttons: number;
    links: number;
    inputs: number;
  };

  @IsOptional()
  @IsObject()
  summary?: {
    processingTime: number;
    loginAttempted: boolean;
    finalUrl: string;
  };

  @IsOptional()
  @IsObject()
  scrapedData?: {
    success: boolean;
    totalPages: number;
    crawlTime: number;
    pages: Array<{
      url: string;
      title: string;
      html: string;
      scrapedData: any;
      timestamp: string;
      pageInfo: {
        title: string;
        url: string;
        bodyText: string;
        totalElements: number;
        buttons: number;
        links: number;
        inputs: number;
      };
    }>;
  };

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TourStepDto)
  tourSteps?: TourStepDto[];

  @IsOptional()
  @IsObject()
  tourResult?: {
    success: boolean;
    totalSteps: number;
    processingTime: number;
    finalUrl: string;
    error?: string;
    screenshots?: string[];
    summary: {
      featuresCovered: string[];
      actionsPerformed: string[];
      successRate: number;
    };
  };
}

export class GenerateTourRequestDto {
  @IsUrl()
  websiteUrl: string;

  @IsObject()
  credentials: {
    username: string;
    password: string;
  };

  @IsString()
  featureName: string;

  @IsString()
  goal: string;

  @IsOptional()
  @IsNumber()
  maxSteps?: number;
}
