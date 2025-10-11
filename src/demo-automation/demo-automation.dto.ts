import { IsString, IsUrl, IsOptional, IsObject } from 'class-validator';

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
