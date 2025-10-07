import {
  IsString,
  IsUrl,
  IsOptional,
  IsObject,
  ValidateNested,
  IsEmail,
} from 'class-validator';
import { Type } from 'class-transformer';

export class LoginCredentialsDto {
  @IsString()
  username: string;

  @IsString()
  password: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class CreateDemoRequestDto {
  @IsUrl({}, { message: 'Website URL must be a valid URL' })
  websiteUrl: string;

  @ValidateNested()
  @Type(() => LoginCredentialsDto)
  credentials: LoginCredentialsDto;

  @IsOptional()
  @IsString()
  demoName?: string;

  @IsOptional()
  @IsObject()
  additionalOptions?: Record<string, any>;
}

export class WISStepDto {
  @IsString()
  selector: string;

  @IsString()
  action: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  @IsObject()
  tooltip?: {
    text: string;
    position: 'top' | 'bottom' | 'left' | 'right';
  };
}

export class WebInteractionScriptDto {
  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  category: string;

  @ValidateNested({ each: true })
  @Type(() => WISStepDto)
  steps: WISStepDto[];

  @IsOptional()
  @IsObject()
  metadata?: Record<string, any>;
}

export class CreateDemoResponseDto {
  @IsString()
  demoId: string;

  @IsString()
  demoName: string;

  @IsUrl()
  websiteUrl: string;

  @ValidateNested({ each: true })
  @Type(() => WebInteractionScriptDto)
  generatedScripts: WebInteractionScriptDto[];

  @IsOptional()
  @IsObject()
  summary?: {
    totalFlows: number;
    totalSteps: number;
    processingTime: number;
  };

  @IsOptional()
  @IsObject()
  filePaths?: {
    demoFolder: string;
    wisFiles: string[];
    metadataFile: string;
  };
}
