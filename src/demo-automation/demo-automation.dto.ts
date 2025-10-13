import { IsString, IsUrl, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class FeatureFileDto {
  @IsString()
  filename: string;

  @IsString()
  content: string;

  @IsString()
  type: 'api-docs' | 'product-docs' | 'tech-docs' | 'other';
}

export class CreateDemoRequestDto {
  @IsUrl()
  websiteUrl: string;

  @IsObject()
  credentials: { username: string; password: string };

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FeatureFileDto)
  @IsOptional()
  featureFiles?: FeatureFileDto[];

  @IsString()
  @IsOptional()
  targetFeature?: string;
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
}
