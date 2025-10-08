import {
  IsString,
  IsUrl,
  IsOptional,
  IsObject,
  IsArray,
} from 'class-validator';

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
  extractedFeatures?: {
    features: Array<{
      name: string;
      description: string;
      actions: string[];
      selector?: string;
      category: string;
      importance: 'high' | 'medium' | 'low';
    }>;
    navigation: {
      menus: string[];
      buttons: string[];
      forms: string[];
    };
    pageStructure: {
      sections: string[];
      interactiveElements: number;
    };
  };
}
