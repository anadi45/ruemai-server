import { Module } from '@nestjs/common';
import { UploadService } from './upload.service';
import { ParserModule } from '../parser/parser.module';

@Module({
  imports: [ParserModule],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
