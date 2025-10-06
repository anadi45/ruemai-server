import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ProductExtractionModule } from './product-extraction/product-extraction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ProductExtractionModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
