import { IsString, IsUrl, IsOptional, IsObject, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export interface ScrapedData {
  url: string;
  title: string;
  content: string;
  screenshots?: string[];
  elements?: {
    buttons: Array<{ selector: string; text: string; type: string }>;
    links: Array<{ selector: string; text: string; href: string }>;
    inputs: Array<{ selector: string; type: string; placeholder?: string }>;
  };
  productTours?: ProductTour[];
}

export interface ProductTourStep {
  stepNumber: number;
  description: string;
  targetElement: string;
  action: string;
  screenshot?: string;
}

export interface ProductTour {
  featureName: string;
  description: string;
  steps: ProductTourStep[];
}

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
  @IsString({ each: true })
  urlsToScrape: string[];

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
  @IsArray()
  productTours: ProductTour[];
}
