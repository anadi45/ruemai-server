import { Module } from '@nestjs/common';
import { PerformanceService } from './performance.service';

@Module({
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
