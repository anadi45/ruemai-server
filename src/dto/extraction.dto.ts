import {
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsUrl,
  Min,
  Max,
} from 'class-validator';

export class ExtractionRequestDto {
  @IsOptional()
  @IsUrl({}, { message: 'URL must be a valid URL' })
  url?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxPages?: number;
}

export class WebsiteExtractionDto {
  @IsUrl({}, { message: 'URL must be a valid URL' })
  url: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxPages?: number;
}
