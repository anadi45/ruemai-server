import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { DemoAutomationModule } from './demo-automation/demo-automation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DemoAutomationModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
