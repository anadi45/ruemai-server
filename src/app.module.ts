import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductExtractionModule } from './product-extraction/product-extraction.module';
import { ExtractionModule } from './extraction/extraction.module';
import { AppConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AppConfigModule,
    HealthModule,
    ProductExtractionModule,
    ExtractionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
