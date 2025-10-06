import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductExtractionModule } from './product-extraction/product-extraction.module';
import { ExtractionModule } from './extraction/extraction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ProductExtractionModule,
    ExtractionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
