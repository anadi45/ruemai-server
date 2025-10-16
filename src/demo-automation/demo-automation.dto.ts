import { IsString, IsUrl, IsOptional, IsObject, IsNumber, IsBoolean, IsArray, ValidateNested, IsNotEmpty, MinLength, NotEquals, registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
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

  @IsNumber()
  timestamp: number;

  @IsBoolean()
  success: boolean;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

export class CreateDemoRequestDto {
  @IsUrl()
  websiteUrl: string;

  @IsString()
  @IsNotEmpty({ message: 'Username is required' })
  @NotEquals('undefined', { message: 'Username cannot be undefined' })
  @MinLength(1, { message: 'Username cannot be empty' })
  username: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @NotEquals('undefined', { message: 'Password cannot be undefined' })
  @MinLength(1, { message: 'Password cannot be empty' })
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
    summary: {
      featuresCovered: string[];
      actionsPerformed: string[];
      successRate: number;
    };
  };
}

// Custom validator for file validation
export function IsFilesPresent(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'isFilesPresent',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments) {
          // This validator will be used in the controller, not in the DTO
          return true;
        },
      },
    });
  };
}
