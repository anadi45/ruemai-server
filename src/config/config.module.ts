import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ConfigValidationService } from './config-validation.service';
import { ApiKeyValidator } from '../validators/api-key.validator';

@Module({
  imports: [ConfigModule],
  providers: [ConfigValidationService, ApiKeyValidator],
  exports: [ConfigValidationService, ApiKeyValidator],
})
export class AppConfigModule {}
