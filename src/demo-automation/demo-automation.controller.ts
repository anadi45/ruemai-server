import { Controller, Post, Body } from '@nestjs/common';
import { DemoAutomationService } from './demo-automation.service';
import { CreateDemoResponseDto } from './demo-automation.dto';

@Controller('demo')
export class DemoAutomationController {
  constructor(private readonly demoAutomationService: DemoAutomationService) {}

  @Post('create-demo')
  async createDemo(
    @Body()
    body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
    },
  ): Promise<CreateDemoResponseDto> {
    try {
      const result = await this.demoAutomationService.generateProductTour(
        body.websiteUrl,
        body.credentials,
      );

      return result;
    } catch (error) {
      console.error('❌ Demo creation failed:', error);
      throw error;
    }
  }

  @Post('debug-login')
  async debugLogin(
    @Body()
    body: {
      websiteUrl: string;
      credentials: { username: string; password: string };
    },
  ): Promise<{ success: boolean; debugInfo: any }> {
    try {
      console.log('🔍 Starting debug login process...');
      console.log(`🌐 URL: ${body.websiteUrl}`);
      console.log(`👤 Username: ${body.credentials.username}`);
      
      const debugInfo = await this.demoAutomationService.debugLoginProcess(
        body.websiteUrl,
        body.credentials,
      );

      return {
        success: debugInfo.loginSuccess,
        debugInfo,
      };
    } catch (error) {
      console.error('❌ Debug login failed:', error);
      return {
        success: false,
        debugInfo: {
          error: error.message,
          stack: error.stack,
        },
      };
    }
  }
}
