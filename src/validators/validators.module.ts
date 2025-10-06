import { Module } from '@nestjs/common';
import { ApiKeyValidator } from './api-key.validator';

@Module({
  providers: [ApiKeyValidator],
  exports: [ApiKeyValidator],
})
export class ValidatorsModule {}
