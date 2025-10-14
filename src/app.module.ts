import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppService } from './app.service';
import { AppConfigModule } from './config/config.module';
import { DemoAutomationModule } from './demo-automation/demo-automation.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    AppConfigModule,
    DemoAutomationModule,
  ],
  controllers: [],
  providers: [AppService],
})
export class AppModule {}
